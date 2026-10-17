import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withinPercentBound(current, proposed, maxPercent) {
  return Math.abs(proposed - current) * 100 <= current * maxPercent;
}

function deltaPercent(current, proposed) {
  return (Math.abs(proposed - current) * 100) / current;
}

function canonicalCategory(value, allowed) {
  const exact = allowed.find((category) => category === value);
  if (exact) return { permitted: true, value: exact, remediated: false };

  const folded = value.toLocaleLowerCase('en-US');
  const canonical = allowed.find(
    (category) => category.toLocaleLowerCase('en-US') === folded,
  );

  return canonical
    ? { permitted: true, value: canonical, remediated: true }
    : { permitted: false, value, remediated: false };
}

export function buildSyntheticCatalog() {
  const categories = ['Electronics', 'Home', 'General'];

  const current = Array.from({ length: 10_000 }, (_, index) => {
    const n = index + 1;
    return {
      sku: `SKU-${String(n).padStart(5, '0')}`,
      price_cents: n === 8421 ? 49_900 : 10_000 + (index % 5_000),
      category: categories[index % categories.length],
    };
  });

  const proposals = current.map((row) => ({ ...row }));

  // 100 autonomous price changes remain inside the configured ±10% bound.
  for (let index = 0; index < 100; index += 1) {
    proposals[index].price_cents = Math.round(current[index].price_cents * 1.05);
  }

  // 157 harmless category casing errors are canonicalized before any write.
  for (let index = 100; index < 257; index += 1) {
    proposals[index].category = current[index].category.toLocaleLowerCase('en-US');
  }

  // One critical pricing flash-crash crosses the policy boundary.
  proposals[8420].price_cents = 4_900;

  return { current, proposals };
}

export class SyntheticCatalog {
  constructor(records, { pretendWriteOnly = false } = {}) {
    this.records = new Map(records.map((row) => [row.sku, { ...row }]));
    this.pretendWriteOnly = pretendWriteOnly;
    this.calls = [];
  }

  async readSkus(skus) {
    this.calls.push({ type: 'read', count: skus.length });
    return skus.map((sku) => {
      const row = this.records.get(sku);
      if (!row) throw new Error(`Unknown SKU: ${sku}`);
      return { ...row };
    });
  }

  async applyUpdates(updates, { idempotencyKey }) {
    this.calls.push({ type: 'apply', count: updates.length });

    if (!this.pretendWriteOnly) {
      for (const update of updates) {
        this.records.set(update.sku, { ...update });
      }
    }

    return {
      attempted: true,
      succeeded: true,
      operation_id: idempotencyKey,
      applied_skus: updates.map((row) => row.sku),
    };
  }

  snapshot() {
    return [...this.records.values()]
      .map((row) => ({ ...row }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }
}

export async function protectCatalogBatch(
  proposals,
  catalog,
  {
    max_delta_percent = 10,
    allowed_categories = ['Electronics', 'Home', 'General'],
  } = {},
) {
  const skus = proposals.map((row) => row.sku);
  const before = await catalog.readSkus(skus);
  const beforeBySku = new Map(before.map((row) => [row.sku, row]));

  const safeTargets = [];
  const pending = [];
  let autoRemediated = 0;
  let boundedChanges = 0;
  let unchanged = 0;

  for (const proposal of proposals) {
    const current = beforeBySku.get(proposal.sku);
    if (!current) {
      pending.push({
        sku: proposal.sku,
        status: 'REQUIRES_APPROVAL',
        reason: 'AUTHORITATIVE_STATE_MISSING',
      });
      continue;
    }

    const category = canonicalCategory(
      proposal.category,
      allowed_categories,
    );

    if (!category.permitted) {
      pending.push({
        sku: proposal.sku,
        status: 'REQUIRES_APPROVAL',
        reason: 'CATEGORY_OUTSIDE_POLICY',
      });
      continue;
    }

    const priceAllowed = withinPercentBound(
      current.price_cents,
      proposal.price_cents,
      max_delta_percent,
    );

    if (!priceAllowed) {
      pending.push({
        sku: proposal.sku,
        status: 'REQUIRES_APPROVAL',
        reason: 'PRICE_DELTA_EXCEEDS_POLICY',
        current_price_cents: current.price_cents,
        proposed_price_cents: proposal.price_cents,
        price_delta_percent: deltaPercent(
          current.price_cents,
          proposal.price_cents,
        ),
      });
      continue;
    }

    if (category.remediated) autoRemediated += 1;

    const desired = {
      sku: proposal.sku,
      price_cents: proposal.price_cents,
      category: category.value,
    };

    if (
      desired.price_cents !== current.price_cents ||
      desired.category !== current.category
    ) {
      boundedChanges += 1;
    } else if (!category.remediated) {
      unchanged += 1;
    }

    safeTargets.push(desired);
  }

  const actualWrites = safeTargets.filter((target) => {
    const current = beforeBySku.get(target.sku);
    return (
      current &&
      (
        target.price_cents !== current.price_cents ||
        target.category !== current.category
      )
    );
  });

  const idempotencyKey = sha256Json({
    scenario: 'synthetic_10000_sku_batch',
    max_delta_percent,
    allowed_categories,
    writes: actualWrites,
    pending,
  });

  let applyResult = {
    attempted: false,
    succeeded: true,
    operation_id: null,
  };

  if (actualWrites.length > 0) {
    applyResult = await catalog.applyUpdates(
      actualWrites,
      { idempotencyKey },
    );
  }

  if (!applyResult.succeeded) {
    return {
      status: 'REMEDIATION_FAILED',
      total: proposals.length,
      reverified: 0,
      autoRemediated,
      boundedChanges,
      unchanged,
      pendingApproval: pending.length,
      failed: safeTargets.length,
      pending,
      idempotencyKey,
    };
  }

  const readBack = await catalog.readSkus(
    safeTargets.map((row) => row.sku),
  );
  const readBackBySku = new Map(readBack.map((row) => [row.sku, row]));

  const failedRows = [];
  for (const expected of safeTargets) {
    const actual = readBackBySku.get(expected.sku);
    if (
      !actual ||
      actual.price_cents !== expected.price_cents ||
      actual.category !== expected.category
    ) {
      failedRows.push({
        sku: expected.sku,
        status: 'REMEDIATION_FAILED',
        reason: 'AUTHORITATIVE_READ_BACK_MISMATCH',
      });
    }
  }

  const failed = failedRows.length;
  const reverified = safeTargets.length - failed;
  const status =
    failed > 0
      ? 'REMEDIATION_FAILED'
      : pending.length > 0
        ? 'REQUIRES_APPROVAL'
        : 'REMEDIATED';

  const after = catalog.snapshot();
  const receiptPayload = {
    scenario: 'synthetic_10000_sku_batch',
    status,
    total: proposals.length,
    reverified,
    auto_remediated: autoRemediated,
    bounded_changes: boundedChanges,
    unchanged,
    pending_approval: pending.length,
    failed,
    max_delta_percent,
    before_hash: sha256Json(before),
    after_hash: sha256Json(after),
    idempotency_key: idempotencyKey,
  };

  return {
    status,
    total: proposals.length,
    reverified,
    autoRemediated,
    boundedChanges,
    unchanged,
    pendingApproval: pending.length,
    failed,
    pending,
    failedRows,
    writesApplied: actualWrites.length,
    readBackPerformed: true,
    idempotencyKey,
    after,
    receipt: {
      ...receiptPayload,
      receipt_sha256: sha256Json(receiptPayload),
    },
  };
}

export async function runDemo() {
  const { current, proposals } = buildSyntheticCatalog();
  const catalog = new SyntheticCatalog(current);

  const result = await protectCatalogBatch(proposals, catalog, {
    max_delta_percent: 10,
  });

  const blocked = result.pending.find((row) => row.sku === 'SKU-08421');

  console.log(`Batch status: ${result.status}`);
  console.log(`Autonomous SKU actions: ${result.total}`);
  console.log(`Rows reverified: ${result.reverified}`);
  console.log(`Category drifts auto-remediated: ${result.autoRemediated}`);
  console.log(`Bounded writes applied: ${result.writesApplied}`);
  console.log(`Rows pending approval: ${result.pendingApproval}`);
  console.log(`Failed rows: ${result.failed}`);

  if (blocked) {
    console.log('');
    console.log('Critical action isolated: SKU-08421');
    console.log(`Current price: £${(blocked.current_price_cents / 100).toFixed(2)}`);
    console.log(`AI proposed: £${(blocked.proposed_price_cents / 100).toFixed(2)}`);
    console.log(`Price delta: -${blocked.price_delta_percent.toFixed(2)}%`);
    console.log('Policy: maximum autonomous price change ±10%');
    console.log('WRITE NOT EXECUTED → REQUIRES_APPROVAL');
  }

  console.log('');
  console.log(`Receipt SHA-256: ${result.receipt.receipt_sha256}`);

  writeFileSync(
    join(here, 'receipt.json'),
    JSON.stringify(result.receipt, null, 2) + '\n',
  );

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runDemo();
}
