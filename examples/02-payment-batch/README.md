# Example 02 — 50-record payment batch

This synthetic example demonstrates the **Find → Fix → Prove** loop on a pre-payment staging dataset.

It does **not** connect to a real payment gateway, move money, or modify a customer system.

## Scenario

An AI-assisted workflow prepares 50 fictional payout records from an approved invoice source.

The staged output contains three silent discrepancies:

- the amount on `INV-013` was swapped;
- `INV-026` contains the wrong customer identifier;
- the amount on `INV-037` was swapped.

Because the two amounts were exchanged, the **grand total still matches**.

A total-only check therefore looks healthy while three record-level values are wrong.

## Run it

Requires Node.js 20+.

```bash
cd examples/02-payment-batch
node run-check.mjs
```

Expected summary:

```text
Status: REMEDIATED
Rows Checked: 50
Grand Totals Match Before: true
Issues Found: 3
Fixes Applied: 3
Reverified: true
```

The script writes two ignored local artifacts:

- `remediated-output.json`
- `receipt.json`

Run the tests:

```bash
node --test test.mjs
```

## What "remediation" means here

The destination is a **synthetic staging object** held locally.

The demo:

1. compares the AI output with the approved source;
2. identifies the exact changed fields;
3. constructs the corrected local staging state from the approved source;
4. re-runs the same invariant;
5. reports `REMEDIATED` only when all 50 records match;
6. emits a deterministic SHA-256 receipt over the source/output/remediation result.

This is intentionally narrower than production remediation. A real payment, CRM, database or code change would require an authorised connector plus the appropriate policy/approval gate before Audital could write to the target system.

## Why this example exists

Example 01 proves a low-level precision failure.

Example 02 demonstrates the broader Audital 4.0 product direction:

> **Find what changed. Fix the bounded state. Prove the result matches the trusted source.**

All data in this folder is fictional.
