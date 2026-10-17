import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audital, jsonPayload, deploymentRollback, tokenRevocation, runShowcase,
} from './run-check.mjs';

test('same audital.protect primitive executes three independent synthetic adapters', async () => {
  const results = await runShowcase();
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((x) => x.adapter.identity)).size, 3);
  for (const { adapter, result } of results) {
    assert.equal(result.status, 'REMEDIATED');
    assert.equal(result.applied, true);
    assert.equal(result.readBackPerformed, true);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.match(result.receiptSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(adapter.trace, [
      'read', 'prepare', 'authorize', 'apply', 'read', 'reverify',
    ]);
  }
  assert.equal(results[0].adapter.snapshot().event.customer_id, 'CUS-100');
  assert.equal(results[1].adapter.snapshot().revision, 'last-good-build');
  assert.equal(results[1].adapter.snapshot().health, 'HEALTHY');
  assert.deepEqual(results[2].adapter.snapshot().permissions['FAKE-TOKEN-1'], []);
  assert.deepEqual(results[2].adapter.snapshot().permissions['FAKE-OTHER'], ['read']);
});

test('denied action is not applied', async () => {
  const case1 = jsonPayload();
  case1.adapter.authorize = async () => ({ decision: 'DENIED' });
  const result = await audital.protect(case1);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(!case1.adapter.trace.includes('apply'));
  assert.equal(case1.adapter.snapshot().event.customer_id, 'WRONG');
});

test('approval for another fingerprint cannot authorise an action', async () => {
  const scenario = tokenRevocation();
  scenario.adapter.authorize = async () =>
    ({ decision: 'ALLOWED', boundFingerprint: 'wrong-target' });
  const result = await audital.protect(scenario);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(scenario.adapter.snapshot().permissions['FAKE-TOKEN-1'].length, 2);
});

test('acknowledged write without authoritative state change never becomes REMEDIATED', async () => {
  const scenario = deploymentRollback();
  scenario.adapter.apply = async () => ({ outcome: 'APPLIED', operationId: 'fake-ack' });
  const result = await audital.protect(scenario);
  assert.equal(result.status, 'REMEDIATION_FAILED');
  assert.equal(result.readBackPerformed, true);
  assert.equal(scenario.adapter.snapshot().revision, 'bad-build');
});

test('throw after committed write preserves an uncertain outcome', async () => {
  const scenario = jsonPayload();
  const original = scenario.adapter.apply;
  scenario.adapter.apply = async (context) => {
    await original(context);
    throw new Error('timeout after remote commit');
  };
  const result = await audital.protect(scenario);
  assert.equal(result.status, 'OUTCOME_UNKNOWN');
  assert.equal(scenario.adapter.snapshot().event.customer_id, 'CUS-100');
  assert.ok(!scenario.adapter.trace.includes('reverify'));
});

test('missing proof details cannot turn a write into success', async () => {
  const scenario = tokenRevocation();
  scenario.adapter.reverify = async () => ({ passed: true });
  const result = await audital.protect(scenario);
  assert.equal(result.status, 'REMEDIATION_FAILED');
  assert.match(result.receiptSha256, /^[a-f0-9]{64}$/);
});

test('unsafe input number is blocked before authorisation or mutation', async () => {
  const scenario = jsonPayload();
  scenario.contract.intent.customerId = Number.MAX_SAFE_INTEGER + 1;
  const result = await audital.protect(scenario);
  assert.equal(result.status, 'INDETERMINATE');
  assert.equal(result.reason, 'UNCANONICALIZABLE_PLAN');
  assert.ok(!scenario.adapter.trace.includes('authorize'));
  assert.ok(!scenario.adapter.trace.includes('apply'));
});

test('rejected stale version never becomes verified remediation', async () => {
  const scenario = deploymentRollback();
  const originalPrepare = scenario.adapter.prepare;
  scenario.adapter.prepare = async (context) => {
    const plan = await originalPrepare(context);
    // Synthetic out-of-band change before the conditional write.
    const originalApply = scenario.adapter.apply;
    scenario.adapter.apply = async (args) =>
      originalApply({ ...args, before: { ...args.before, version: 'etag-old' } });
    return plan;
  };
  const result = await audital.protect(scenario);
  assert.equal(result.status, 'REMEDIATION_FAILED');
  assert.equal(scenario.adapter.snapshot().revision, 'bad-build');
});
