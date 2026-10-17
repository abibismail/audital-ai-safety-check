# Example 03 — CRM sync drift

This synthetic example demonstrates why a successful CRM sync is not enough.

An AI-assisted workflow updates **500 fictional customer records**. The operation appears successful, but one customer is attached to the wrong company.

Audital's public learning example shows the lifecycle:

```text
FIND
  ↓
REQUIRES_APPROVAL
  ↓
synthetic local approval
  ↓
FIX
  ↓
authoritative CRM read-back
  ↓
PROVE
  ↓
REMEDIATED
```

It does **not** connect to Salesforce, HubSpot, or a real customer CRM.

## Hidden drift

The trusted state says:

```text
CUS-0237 → COMP-024
```

The synthetic CRM contains:

```text
CUS-0237 → COMP-999
```

The API-style write can report success, but Audital does not call the record remediated until the synthetic CRM is read back and the same relationship invariant passes.

## Run it

Requires Node.js 20+.

```bash
cd examples/03-crm-sync-drift
node run-check.mjs
```

Expected lifecycle:

```text
Initial status: REQUIRES_APPROVAL
CRM records checked: 500
Hidden deviations found: 1
Synthetic local approval: GRANTED
Final status: REMEDIATED
Fixes applied: 1
Authoritative read-back: true
Remaining deviations: 0
```

Run the tests:

```bash
node --test test.mjs
```

One test deliberately uses a fake connector that reports a successful write **without actually changing the CRM state**. The expected result is:

```text
REMEDIATION_FAILED
```

That is the point of the example: a 200/OK-style response is not proof that the business state changed.

## Safety boundary

This example uses a local in-memory synthetic CRM and fictional records only.

Production remediation would require:

- an authorised CRM connector;
- explicit field-level remediation policy;
- approval where required;
- authoritative post-write read-back;
- the private fail-closed Audital kernel.

No production CRM write capability is claimed by this repository.
