# Example 04 — 10,000-SKU bounded autonomy

This synthetic example demonstrates **controlled autonomy**.

An AI agent proposes 10,000 catalogue actions:

- **9,742** rows need no change;
- **100** price changes are within the allowed autonomous ±10% policy;
- **157** category casing mistakes are canonicalized automatically before write;
- **1** SKU attempts a catastrophic price change from **£499.00 to £49.00**.

Audital does **not** fail the whole batch.

It surgically isolates the one out-of-policy action as `REQUIRES_APPROVAL` while allowing the other **9,999 rows** to reach `REVERIFIED`.

## Run it

Requires Node.js 20+.

```bash
cd examples/04-ecommerce-bounded-autonomy
node run-check.mjs
```

Expected summary:

```text
Batch status: REQUIRES_APPROVAL
Autonomous SKU actions: 10000
Rows reverified: 9999
Category drifts auto-remediated: 157
Bounded writes applied: 100
Rows pending approval: 1
Failed rows: 0

Critical action isolated: SKU-08421
Current price: £499.00
AI proposed: £49.00
Price delta: -90.18%
Policy: maximum autonomous price change ±10%
WRITE NOT EXECUTED → REQUIRES_APPROVAL
```

## What this proves

The point is not merely that Audital can block a dangerous action.

The point is that **one dangerous action does not have to stop the other 9,999 safe actions**.

That is the controlled-autonomy model:

```text
AI batch
   │
   ├── safe / bounded actions ──→ APPLY ──→ READ BACK ──→ REVERIFIED
   │
   └── out-of-policy action ────→ ISOLATE ──────────────→ REQUIRES_APPROVAL
```

The overall batch remains `REQUIRES_APPROVAL` until the unresolved row is handled, while already-safe rows are not rolled back or unnecessarily blocked.

## Numerical boundary

The policy is explicit:

```json
{
  "max_delta_percent": 10
}
```

The tests prove that:

- exactly **10%** is within the autonomous boundary;
- **10.01%** requires approval.

## False-success test

A second test uses a synthetic adapter that reports a successful write but deliberately leaves the catalogue unchanged.

Audital performs authoritative read-back and returns:

```text
REMEDIATION_FAILED
```

A successful API response is not treated as a successful business outcome.

## Safety boundary

This repository does **not** connect to Shopify, Amazon, Stripe, a live store, or any customer system.

The catalogue and adapter are entirely synthetic and local. Production remediation would require an authorised connector, explicit policy, idempotency, authoritative read-back, and the private fail-closed Audital kernel.
