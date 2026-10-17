// Educational reference protocol. NOT the private Audital kernel or a production SDK.
// No credentials, external calls, live systems or customer data.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const clone = (value) => structuredClone(value);
const digest = (text) => createHash('sha256').update(text).digest('hex');

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new Error('UNSAFE_NUMERIC_INPUT');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('CYCLIC_INPUT');
    seen.add(value);
    const result = '[' + value.map((item) => canonical(item, seen)).join(',') + ']';
    seen.delete(value);
    return result;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    if (seen.has(value) || Object.getOwnPropertySymbols(value).length) throw new Error('NON_JSON_INPUT');
    seen.add(value);
    const result = '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonical(value[key], seen)).join(',') + '}';
    seen.delete(value);
    return result;
  }
  throw new Error('NON_JSON_INPUT');
}

function proven(check) {
  return check?.passed === true &&
    (check.remainingDeviations === undefined || check.remainingDeviations === 0) &&
    ((Array.isArray(check.checkedScope) &&
      check.checkedScope.length > 0 &&
      check.checkedScope.every((x) => typeof x === 'string' && x.trim())) ||
     (typeof check.evidenceReference === 'string' && check.evidenceReference.trim()));
}

export const audital = Object.freeze({
  async protect({ contract, adapter }) {
    const fields = [contract?.workflowId, contract?.resourceId, contract?.policyId,
      contract?.policyVersion, contract?.idempotencyKey, adapter?.identity];
    if (!fields.every((x) => typeof x === 'string' && x.length > 0)) {
      throw new Error('INVALID_CONTRACT');
    }
    const finish = (status, info = {}) => {
      const receipt = {
        kind: 'LOCAL_SYNTHETIC_REFERENCE_NOT_PRODUCTION',
        workflowId: contract.workflowId,
        resourceId: contract.resourceId,
        policyId: contract.policyId,
        policyVersion: contract.policyVersion,
        destination: adapter.identity,
        status, ...info,
      };
      return { ...receipt, receiptSha256: digest(canonical(receipt)) };
    };
    let before;
    try {
      before = await adapter.readAuthoritativeState(contract);
      if (!before.version || before.source !== adapter.identity) {
        return finish('INDETERMINATE', { reason: 'INVALID_SOURCE' });
      }
    } catch {
      return finish('INDETERMINATE', { reason: 'READ_FAILED' });
    }
    let plan;
    try {
      plan = await adapter.prepare({ contract, before });
    } catch {
      return finish('INDETERMINATE', { reason: 'PREPARATION_FAILED' });
    }
    if (plan.kind === 'BLOCKED') return finish('BLOCKED', { reason: plan.reason });
    if (plan.kind === 'NO_ACTION') {
      try {
        const proof = await adapter.reverify({ contract, before, after: before, plan });
        return finish(proven(proof) ? 'VERIFIED' : 'INDETERMINATE', { proof });
      } catch {
        return finish('INDETERMINATE', { reason: 'NO_ACTION_UNPROVEN' });
      }
    }
    if (plan.kind !== 'READY') return finish('INDETERMINATE', { reason: 'INVALID_PLAN' });
    let fingerprint;
    try {
      fingerprint = digest('AUDITAL_EDUCATIONAL_PLAN_V1\0' + canonical({
        workflowId: contract.workflowId, resourceId: contract.resourceId,
        policyId: contract.policyId, policyVersion: contract.policyVersion,
        idempotencyKey: contract.idempotencyKey, destination: adapter.identity,
        beforeVersion: before.version, intent: contract.intent, action: plan.action,
      }));
    } catch {
      return finish('INDETERMINATE', { reason: 'UNCANONICALIZABLE_PLAN' });
    }
    let approval;
    try {
      approval = await adapter.authorize({ contract, before, plan, fingerprint });
    } catch {
      return finish('INDETERMINATE', { fingerprint, reason: 'AUTHORIZATION_UNAVAILABLE' });
    }
    if (approval.decision === 'REQUIRES_APPROVAL') {
      return finish('REQUIRES_APPROVAL', { fingerprint });
    }
    if (approval.decision !== 'ALLOWED' || approval.boundFingerprint !== fingerprint) {
      return finish('BLOCKED', { fingerprint, reason: 'UNBOUND_AUTHORIZATION' });
    }
    let result;
    try {
      result = await adapter.apply({ contract, before, plan, fingerprint });
    } catch {
      return finish('OUTCOME_UNKNOWN', { fingerprint, reason: 'WRITE_MAY_HAVE_COMMITTED' });
    }
    if (result.outcome === 'UNKNOWN') {
      return finish('OUTCOME_UNKNOWN', { fingerprint, reason: result.reason });
    }
    if (result.outcome !== 'APPLIED') {
      return finish('REMEDIATION_FAILED', { fingerprint, reason: result.reason });
    }
    let after;
    try {
      after = await adapter.readAuthoritativeState(contract);
      if (!after.version || after.source !== before.source) {
        return finish('AWAITING_VERIFICATION', { fingerprint, operationId: result.operationId });
      }
    } catch {
      return finish('AWAITING_VERIFICATION', { fingerprint, operationId: result.operationId });
    }
    try {
      const proof = await adapter.reverify({ contract, before, after, plan });
      return finish(proven(proof) ? 'REMEDIATED' : 'REMEDIATION_FAILED', {
        fingerprint, operationId: result.operationId,
        applied: true, readBackPerformed: true,
        beforeVersion: before.version, afterVersion: after.version, proof,
      });
    } catch {
      return finish('AWAITING_VERIFICATION', {
        fingerprint, operationId: result.operationId, reason: 'REVERIFICATION_UNAVAILABLE',
      });
    }
  },
});

export function jsonPayload() {
  const state = { version: 1, event: { id: 'EVT-17', customer_id: 'WRONG', cents: 8750 } };
  const trace = [], identity = 'synthetic-json://events';
  const contract = { workflowId: 'event-repair', resourceId: 'EVT-17',
    policyId: 'identity-source', policyVersion: '1', idempotencyKey: 'json-17',
    intent: { customerId: 'CUS-100' } };
  const adapter = {
    identity, trace, snapshot: () => clone(state),
    async readAuthoritativeState() {
      trace.push('read');
      return { state: clone(state.event), version: String(state.version), source: identity };
    },
    async prepare({ contract: job, before }) {
      trace.push('prepare');
      if (before.state.customer_id === job.intent.customerId) return { kind: 'NO_ACTION' };
      return { kind: 'READY', action: { type: 'PATCH_JSON',
        key: 'customer_id', value: job.intent.customerId } };
    },
    async authorize({ fingerprint, plan }) {
      trace.push('authorize');
      return plan.action.key === 'customer_id' ?
        { decision: 'ALLOWED', boundFingerprint: fingerprint } :
        { decision: 'DENIED' };
    },
    async apply({ before, plan }) {
      trace.push('apply');
      if (before.version !== String(state.version)) {
        return { outcome: 'REJECTED', reason: 'STALE_VERSION' };
      }
      state.event[plan.action.key] = plan.action.value; state.version++;
      return { outcome: 'APPLIED', operationId: 'json-op-17' };
    },
    async reverify({ contract: job, before, after }) {
      trace.push('reverify');
      const passed = after.state.customer_id === job.intent.customerId &&
        after.state.id === before.state.id && after.state.cents === before.state.cents;
      return { passed, checkedScope: ['customer_id', 'id', 'cents'],
        remainingDeviations: passed ? 0 : 1 };
    },
  };
  return { label: 'JSON payload repair', contract, adapter };
}

export function deploymentRollback() {
  const state = { version: 1, revision: 'bad-build', health: 'UNHEALTHY' };
  const trace = [], identity = 'synthetic-cloud://test-service';
  const contract = { workflowId: 'rollback', resourceId: 'test-service',
    policyId: 'healthy-release', policyVersion: '1', idempotencyKey: 'rollback-1',
    intent: { revision: 'last-good-build' } };
  const adapter = {
    identity, trace, snapshot: () => clone(state),
    async readAuthoritativeState() {
      trace.push('read');
      return { state: { revision: state.revision, health: state.health },
        version: 'etag-' + state.version, source: identity };
    },
    async prepare({ contract: job }) {
      trace.push('prepare');
      return { kind: 'READY', action: { type: 'ROLLBACK_CHANGE',
        revision: job.intent.revision } };
    },
    async authorize({ plan, fingerprint }) {
      trace.push('authorize');
      return plan.action.type === 'ROLLBACK_CHANGE' ?
        { decision: 'ALLOWED', boundFingerprint: fingerprint } :
        { decision: 'DENIED' };
    },
    async apply({ before, plan }) {
      trace.push('apply');
      if (before.version !== 'etag-' + state.version) {
        return { outcome: 'REJECTED', reason: 'STALE_DEPLOYMENT' };
      }
      state.revision = plan.action.revision; state.health = 'HEALTHY'; state.version++;
      return { outcome: 'APPLIED', operationId: 'rollback-op-1' };
    },
    async reverify({ contract: job, after }) {
      trace.push('reverify');
      const passed = after.state.revision === job.intent.revision &&
        after.state.health === 'HEALTHY';
      return { passed, evidenceReference: 'synthetic://test-service/health-check' };
    },
  };
  return { label: 'Deployment rollback', contract, adapter };
}

export function tokenRevocation() {
  const state = { version: 1,
    revoked: [], permissions: { 'FAKE-TOKEN-1': ['read', 'admin'], 'FAKE-OTHER': ['read'] } };
  const trace = [], identity = 'synthetic-idp://tenant';
  const contract = { workflowId: 'contain-token', resourceId: 'FAKE-TOKEN-1',
    policyId: 'agent-containment', policyVersion: '1', idempotencyKey: 'revoke-1',
    intent: { token: 'FAKE-TOKEN-1' } };
  const adapter = {
    identity, trace, snapshot: () => clone(state),
    async readAuthoritativeState() {
      trace.push('read');
      return { state: clone({ revoked: state.revoked, permissions: state.permissions }),
        version: 'rev-' + state.version, source: identity };
    },
    async prepare({ contract: job }) {
      trace.push('prepare');
      return { kind: 'READY', action: { type: 'REVOKE_ACCESS', token: job.intent.token } };
    },
    async authorize({ contract: job, plan, fingerprint }) {
      trace.push('authorize');
      return plan.action.token === job.resourceId ?
        { decision: 'ALLOWED', boundFingerprint: fingerprint } :
        { decision: 'DENIED' };
    },
    async apply({ before, plan }) {
      trace.push('apply');
      if (before.version !== 'rev-' + state.version) {
        return { outcome: 'REJECTED', reason: 'STALE_IDENTITY' };
      }
      state.permissions[plan.action.token] = [];
      state.revoked.push(plan.action.token); state.version++;
      return { outcome: 'APPLIED', operationId: 'revoke-op-1' };
    },
    async reverify({ contract: job, after }) {
      trace.push('reverify');
      const passed = after.state.revoked.includes(job.intent.token) &&
        after.state.permissions[job.intent.token]?.length === 0 &&
        after.state.permissions['FAKE-OTHER']?.length === 1;
      return { passed, checkedScope: ['revocation', 'effective-grants', 'other-token'] };
    },
  };
  return { label: 'Token revocation', contract, adapter };
}

export async function runShowcase() {
  const scenarios = [jsonPayload(), deploymentRollback(), tokenRevocation()];
  return Promise.all(scenarios.map(async (scenario) => ({
    ...scenario,
    result: await audital.protect(scenario),
  })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = await runShowcase();
  console.log('Example 05: local educational reference, not the private kernel');
  for (const entry of results) {
    console.log(entry.label + ': ' + entry.result.status +
      ' (receipt SHA-256 ' + entry.result.receiptSha256 + ')');
  }
  console.log('Network writes: 0');
  if (results.some((x) => x.result.status !== 'REMEDIATED')) process.exitCode = 1;
}
