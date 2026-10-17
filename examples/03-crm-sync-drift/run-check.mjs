import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function findDeviations(trusted, actual) {
  const trustedById = new Map(trusted.map((row) => [row.customer_id, row]));
  const actualById = new Map(actual.map((row) => [row.customer_id, row]));
  const deviations = [];

  for (const [customerId, expected] of trustedById) {
    const current = actualById.get(customerId);
    if (!current) {
      deviations.push({
        customer_id: customerId,
        field: 'record',
        expected: 'present',
        actual: 'missing',
        severity: 'CRITICAL',
      });
      continue;
    }

    for (const field of ['company_id', 'email']) {
      if (current[field] !== expected[field]) {
        deviations.push({
          customer_id: customerId,
          field,
          expected: expected[field],
          actual: current[field],
          severity: field === 'company_id' ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }

  return deviations;
}

export class SyntheticCrm {
  constructor(records, { pretendWriteOnly = false } = {}) {
    this.records = new Map(records.map((row) => [row.customer_id, { ...row }]));
    this.pretendWriteOnly = pretendWriteOnly;
    this.calls = [];
  }

  async readRecord(customerId) {
    this.calls.push(`read:${customerId}`);
    const record = this.records.get(customerId);
    if (!record) throw new Error(`Unknown CRM customer: ${customerId}`);
    return { ...record };
  }

  async applyPatch(customerId, patch, { idempotencyKey }) {
    this.calls.push(`apply:${customerId}`);
    const current = this.records.get(customerId);
    if (!current) {
      return { attempted: true, succeeded: false, operationId: idempotencyKey };
    }

    if (!this.pretendWriteOnly) {
      this.records.set(customerId, { ...current, ...patch });
    }

    return {
      attempted: true,
      succeeded: true,
      operationId: idempotencyKey,
      targetVersion: 'synthetic-v2',
    };
  }

  snapshot() {
    return [...this.records.values()].map((row) => ({ ...row }));
  }
}

export async function protectCrmSync(
  trusted,
  crm,
  { approvedRelationshipFix = false } = {},
) {
  const currentSnapshot = crm.snapshot();
  const deviations = findDeviations(trusted, currentSnapshot);

  if (deviations.length === 0) {
    return {
      status: 'VERIFIED',
      deviations,
      applied: [],
      remaining: [],
      readBackPerformed: false,
      receipt: {
        input_fingerprint: sha256Json({ trusted, currentSnapshot }),
      },
    };
  }

  const approvalRequired = deviations.some(
    (d) => d.field === 'company_id',
  );

  if (approvalRequired && !approvedRelationshipFix) {
    return {
      status: 'REQUIRES_APPROVAL',
      deviations,
      applied: [],
      remaining: deviations,
      readBackPerformed: false,
      receipt: {
        input_fingerprint: sha256Json({ trusted, currentSnapshot }),
      },
    };
  }

  const trustedById = new Map(trusted.map((row) => [row.customer_id, row]));
  const applied = [];

  for (const deviation of deviations) {
    const trustedRow = trustedById.get(deviation.customer_id);
    if (!trustedRow) continue;

    const patch = { [deviation.field]: trustedRow[deviation.field] };
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          workflow: 'synthetic-crm-sync',
          customer_id: deviation.customer_id,
          field: deviation.field,
          expected: deviation.expected,
          actual: deviation.actual,
        }),
      )
      .digest('hex');

    const applyResult = await crm.applyPatch(
      deviation.customer_id,
      patch,
      { idempotencyKey },
    );

    if (!applyResult.attempted || !applyResult.succeeded) {
      return {
        status: 'REMEDIATION_FAILED',
        deviations,
        applied,
        remaining: deviations,
        readBackPerformed: false,
        receipt: {
          input_fingerprint: sha256Json({ trusted, currentSnapshot }),
          operation_id: applyResult.operationId ?? null,
        },
      };
    }

    const readBack = await crm.readRecord(deviation.customer_id);
    if (readBack[deviation.field] !== deviation.expected) {
      return {
        status: 'REMEDIATION_FAILED',
        deviations,
        applied,
        remaining: [{
          ...deviation,
          actual: readBack[deviation.field],
        }],
        readBackPerformed: true,
        receipt: {
          input_fingerprint: sha256Json({ trusted, currentSnapshot }),
          operation_id: applyResult.operationId ?? null,
        },
      };
    }

    applied.push({
      customer_id: deviation.customer_id,
      field: deviation.field,
      before: deviation.actual,
      after: deviation.expected,
      operation_id: applyResult.operationId,
    });
  }

  const after = crm.snapshot();
  const remaining = findDeviations(trusted, after);
  const status = remaining.length === 0 ? 'REMEDIATED' : 'REMEDIATION_FAILED';

  const receiptPayload = {
    scenario: 'synthetic_crm_sync_drift',
    source_hash: sha256Json(trusted),
    before_hash: sha256Json(currentSnapshot),
    after_hash: sha256Json(after),
    deviations_found: deviations.length,
    fixes_applied: applied.length,
    authoritative_read_back: true,
    remaining_deviations: remaining.length,
    status,
  };

  return {
    status,
    deviations,
    applied,
    remaining,
    readBackPerformed: true,
    after,
    receipt: {
      ...receiptPayload,
      receipt_sha256: sha256Json(receiptPayload),
    },
  };
}

export async function runFromFiles() {
  const trusted = JSON.parse(
    readFileSync(join(here, 'trusted-crm.json'), 'utf8'),
  );
  const before = JSON.parse(
    readFileSync(join(here, 'crm-before.json'), 'utf8'),
  );

  const crm = new SyntheticCrm(before);

  const preview = await protectCrmSync(trusted, crm, {
    approvedRelationshipFix: false,
  });

  console.log(`Initial status: ${preview.status}`);
  console.log(`CRM records checked: ${trusted.length}`);
  console.log(`Hidden deviations found: ${preview.deviations.length}`);
  console.table(preview.deviations);

  const result = await protectCrmSync(trusted, crm, {
    approvedRelationshipFix: true,
  });

  console.log('Synthetic local approval: GRANTED');
  console.log(`Final status: ${result.status}`);
  console.log(`Fixes applied: ${result.applied.length}`);
  console.log(`Authoritative read-back: ${result.readBackPerformed}`);
  console.log(`Remaining deviations: ${result.remaining.length}`);
  console.log(`Receipt SHA-256: ${result.receipt.receipt_sha256}`);

  writeFileSync(
    join(here, 'crm-after.json'),
    JSON.stringify(result.after, null, 2) + '\n',
  );
  writeFileSync(
    join(here, 'receipt.json'),
    JSON.stringify(result.receipt, null, 2) + '\n',
  );

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runFromFiles();
}
