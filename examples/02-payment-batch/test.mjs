import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { protectPaymentBatch } from './run-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const approved = JSON.parse(readFileSync(join(here, 'approved-source.json'), 'utf8'));
const ai = JSON.parse(readFileSync(join(here, 'ai-output.json'), 'utf8'));

test('finds, fixes, and proves the synthetic payment batch', () => {
  const result = protectPaymentBatch(approved, ai);

  assert.equal(result.comparedRows, 50);
  assert.equal(result.grandTotalsMatchBefore, true);
  assert.equal(result.issues.length, 3);
  assert.equal(result.applied.length, 3);
  assert.equal(result.remaining.length, 0);
  assert.equal(result.reverified, true);
  assert.equal(result.status, 'REMEDIATED');

  const inv13 = result.issues.find(
    (x) => x.invoice_id === 'INV-013' && x.field === 'amount',
  );
  const inv26 = result.issues.find(
    (x) => x.invoice_id === 'INV-026' && x.field === 'customer_id',
  );
  const inv37 = result.issues.find(
    (x) => x.invoice_id === 'INV-037' && x.field === 'amount',
  );

  assert.ok(inv13);
  assert.ok(inv26);
  assert.ok(inv37);

  assert.equal(result.remediated[12].amount, approved[12].amount);
  assert.equal(result.remediated[25].customer_id, approved[25].customer_id);
  assert.equal(result.remediated[36].amount, approved[36].amount);

  assert.match(result.receipt.receipt_sha256, /^[a-f0-9]{64}$/);
});

test('receipt is deterministic for identical inputs', () => {
  const a = protectPaymentBatch(approved, ai);
  const b = protectPaymentBatch(approved, ai);
  assert.equal(a.receipt.receipt_sha256, b.receipt.receipt_sha256);
});
