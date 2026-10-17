import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cents(value) {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error(`Invalid money value: ${value}`);
  const [whole, fraction] = value.split('.');
  return Number(whole) * 100 + Number(fraction);
}

export function protectPaymentBatch(approvedSource, aiOutput) {
  const approvedById = new Map(approvedSource.map((row) => [row.invoice_id, row]));
  const actualById = new Map(aiOutput.map((row) => [row.invoice_id, row]));

  if (approvedById.size !== approvedSource.length || actualById.size !== aiOutput.length) {
    throw new Error('Duplicate invoice_id detected');
  }

  const issues = [];
  for (const [invoiceId, trusted] of approvedById) {
    const actual = actualById.get(invoiceId);
    if (!actual) {
      issues.push({
        invoice_id: invoiceId,
        field: 'record',
        expected: 'present',
        actual: 'missing',
        risk: 'approval_required',
      });
      continue;
    }

    for (const field of ['customer_id', 'amount']) {
      if (actual[field] !== trusted[field]) {
        issues.push({
          invoice_id: invoiceId,
          field,
          expected: trusted[field],
          actual: actual[field],
          risk: 'synthetic_staging_fix',
        });
      }
    }
  }

  for (const invoiceId of actualById.keys()) {
    if (!approvedById.has(invoiceId)) {
      issues.push({
        invoice_id: invoiceId,
        field: 'record',
        expected: 'absent',
        actual: 'unexpected',
        risk: 'approval_required',
      });
    }
  }

  const approvedTotal = approvedSource.reduce((sum, row) => sum + cents(row.amount), 0);
  const aiTotal = aiOutput.reduce((sum, row) => sum + cents(row.amount), 0);

  const remediated = aiOutput.map((row) => ({ ...row }));
  const remediatedById = new Map(remediated.map((row) => [row.invoice_id, row]));
  const applied = [];

  for (const issue of issues) {
    if (issue.risk !== 'synthetic_staging_fix') continue;
    const target = remediatedById.get(issue.invoice_id);
    const trusted = approvedById.get(issue.invoice_id);
    if (!target || !trusted) continue;
    target[issue.field] = trusted[issue.field];
    applied.push({
      invoice_id: issue.invoice_id,
      field: issue.field,
      before: issue.actual,
      after: issue.expected,
    });
  }

  const remaining = [];
  for (const [invoiceId, trusted] of approvedById) {
    const actual = remediatedById.get(invoiceId);
    if (!actual) {
      remaining.push({ invoice_id: invoiceId, field: 'record', status: 'missing' });
      continue;
    }
    for (const field of ['customer_id', 'amount']) {
      if (actual[field] !== trusted[field]) {
        remaining.push({
          invoice_id: invoiceId,
          field,
          expected: trusted[field],
          actual: actual[field],
        });
      }
    }
  }

  const reverified = remaining.length === 0 && remediated.length === approvedSource.length;
  const receiptPayload = {
    scenario: 'synthetic_pre_payment_staging',
    source_hash: sha256Json(approvedSource),
    original_output_hash: sha256Json(aiOutput),
    remediated_output_hash: sha256Json(remediated),
    issues_found: issues.length,
    fixes_applied: applied.length,
    reverified,
  };

  return {
    status: reverified ? 'REMEDIATED' : 'REMEDIATION_PENDING',
    comparedRows: approvedSource.length,
    grandTotalsMatchBefore: approvedTotal === aiTotal,
    issues,
    applied,
    remaining,
    reverified,
    remediated,
    receipt: {
      ...receiptPayload,
      receipt_sha256: sha256Json(receiptPayload),
    },
  };
}

export function runFromFiles() {
  const approvedSource = JSON.parse(
    readFileSync(join(here, 'approved-source.json'), 'utf8'),
  );
  const aiOutput = JSON.parse(
    readFileSync(join(here, 'ai-output.json'), 'utf8'),
  );

  const result = protectPaymentBatch(approvedSource, aiOutput);

  console.log(`Status: ${result.status}`);
  console.log(`Rows Checked: ${result.comparedRows}`);
  console.log(`Grand Totals Match Before: ${result.grandTotalsMatchBefore}`);
  console.log(`Issues Found: ${result.issues.length}`);
  console.log(`Fixes Applied: ${result.applied.length}`);
  console.log(`Reverified: ${result.reverified}`);
  console.table(result.issues);
  console.log(`Receipt SHA-256: ${result.receipt.receipt_sha256}`);

  writeFileSync(
    join(here, 'remediated-output.json'),
    JSON.stringify(result.remediated, null, 2) + '\n',
  );
  writeFileSync(
    join(here, 'receipt.json'),
    JSON.stringify(result.receipt, null, 2) + '\n',
  );

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runFromFiles();
}
