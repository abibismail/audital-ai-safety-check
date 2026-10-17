import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SyntheticCatalog,
  buildSyntheticCatalog,
  protectCatalogBatch,
} from './run-check.mjs';

test('10,000-SKU batch isolates one critical price crash while 9,999 rows reverify', async () => {
  const { current, proposals } = buildSyntheticCatalog();
  const catalog = new SyntheticCatalog(current);

  const result = await protectCatalogBatch(proposals, catalog, {
    max_delta_percent: 10,
  });

  assert.equal(result.status, 'REQUIRES_APPROVAL');
  assert.equal(result.total, 10_000);
  assert.equal(result.reverified, 9_999);
  assert.equal(result.autoRemediated, 157);
  assert.equal(result.boundedChanges, 100);
  assert.equal(result.unchanged, 9_742);
  assert.equal(result.pendingApproval, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.writesApplied, 100);
  assert.equal(result.readBackPerformed, true);

  const blocked = result.pending.find((row) => row.sku === 'SKU-08421');
  assert.ok(blocked);
  assert.equal(blocked.reason, 'PRICE_DELTA_EXCEEDS_POLICY');
  assert.equal(blocked.current_price_cents, 49_900);
  assert.equal(blocked.proposed_price_cents, 4_900);
  assert.ok(blocked.price_delta_percent > 90);

  const blockedState = result.after.find((row) => row.sku === 'SKU-08421');
  assert.equal(blockedState.price_cents, 49_900);
  assert.match(result.receipt.receipt_sha256, /^[a-f0-9]{64}$/);
});

test('exactly 10% is allowed while 10.01% requires approval', async () => {
  const current = [
    { sku: 'SKU-BOUNDARY', price_cents: 10_000, category: 'General' },
    { sku: 'SKU-OVER', price_cents: 10_000, category: 'General' },
  ];
  const proposals = [
    { sku: 'SKU-BOUNDARY', price_cents: 11_000, category: 'General' },
    { sku: 'SKU-OVER', price_cents: 11_001, category: 'General' },
  ];

  const catalog = new SyntheticCatalog(current);
  const result = await protectCatalogBatch(proposals, catalog, {
    max_delta_percent: 10,
    allowed_categories: ['General'],
  });

  assert.equal(result.status, 'REQUIRES_APPROVAL');
  assert.equal(result.reverified, 1);
  assert.equal(result.pendingApproval, 1);
  assert.equal(result.after.find((row) => row.sku === 'SKU-BOUNDARY').price_cents, 11_000);
  assert.equal(result.after.find((row) => row.sku === 'SKU-OVER').price_cents, 10_000);
});

test('case-only category drift is canonicalized before write', async () => {
  const current = [
    { sku: 'SKU-1', price_cents: 20_000, category: 'Electronics' },
  ];
  const proposals = [
    { sku: 'SKU-1', price_cents: 20_000, category: 'electronics' },
  ];

  const catalog = new SyntheticCatalog(current);
  const result = await protectCatalogBatch(proposals, catalog, {
    max_delta_percent: 10,
    allowed_categories: ['Electronics'],
  });

  assert.equal(result.status, 'REMEDIATED');
  assert.equal(result.autoRemediated, 1);
  assert.equal(result.reverified, 1);
  assert.equal(result.after[0].category, 'Electronics');
});

test('a success response without authoritative state change is not success', async () => {
  const { current, proposals } = buildSyntheticCatalog();
  const catalog = new SyntheticCatalog(current, { pretendWriteOnly: true });

  const result = await protectCatalogBatch(proposals, catalog, {
    max_delta_percent: 10,
  });

  assert.equal(result.status, 'REMEDIATION_FAILED');
  assert.equal(result.failed, 100);
  assert.equal(result.pendingApproval, 1);
  assert.equal(result.reverified, 9_899);
});
