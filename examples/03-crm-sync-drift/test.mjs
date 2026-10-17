import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SyntheticCrm,
  protectCrmSync,
} from './run-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const trusted = JSON.parse(
  readFileSync(join(here, 'trusted-crm.json'), 'utf8'),
);
const before = JSON.parse(
  readFileSync(join(here, 'crm-before.json'), 'utf8'),
);

test('CRM relationship drift requires approval before any write', async () => {
  const crm = new SyntheticCrm(before);
  const result = await protectCrmSync(trusted, crm, {
    approvedRelationshipFix: false,
  });

  assert.equal(result.status, 'REQUIRES_APPROVAL');
  assert.equal(result.deviations.length, 1);
  assert.equal(result.deviations[0].customer_id, 'CUS-0237');
  assert.equal(result.deviations[0].field, 'company_id');
  assert.equal(result.applied.length, 0);
  assert.equal(crm.calls.length, 0);
});

test('approved CRM fix is applied, read back, and reverified before REMEDIATED', async () => {
  const crm = new SyntheticCrm(before);
  const result = await protectCrmSync(trusted, crm, {
    approvedRelationshipFix: true,
  });

  assert.equal(result.status, 'REMEDIATED');
  assert.equal(result.deviations.length, 1);
  assert.equal(result.applied.length, 1);
  assert.equal(result.readBackPerformed, true);
  assert.equal(result.remaining.length, 0);

  const corrected = result.after.find(
    (row) => row.customer_id === 'CUS-0237',
  );
  const expected = trusted.find(
    (row) => row.customer_id === 'CUS-0237',
  );

  assert.equal(corrected.company_id, expected.company_id);
  assert.deepEqual(crm.calls, [
    'apply:CUS-0237',
    'read:CUS-0237',
  ]);
  assert.match(result.receipt.receipt_sha256, /^[a-f0-9]{64}$/);
});

test('write success without changed authoritative state is REMEDIATION_FAILED', async () => {
  const crm = new SyntheticCrm(before, { pretendWriteOnly: true });
  const result = await protectCrmSync(trusted, crm, {
    approvedRelationshipFix: true,
  });

  assert.equal(result.status, 'REMEDIATION_FAILED');
  assert.equal(result.readBackPerformed, true);
  assert.equal(result.remaining.length, 1);
  assert.deepEqual(crm.calls, [
    'apply:CUS-0237',
    'read:CUS-0237',
  ]);
});
