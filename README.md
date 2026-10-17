# Audital AI Safety Check

**Local second checks for AI-generated business data.** This public repository is the open, reproducible learning layer for Audital 4.0.

The idea is simple: valid JSON, a passing schema, or a green workflow run does not prove that a business-critical value stayed correct.

This repository starts with one narrow, reproducible failure mode. More synthetic safety checks can be added as they are independently tested.

> **Important:** this is not the proprietary Audital Guard or Audital Instant product source, and it is not a claim that Audital can detect every AI error. The commercial verification kernel remains private while it is hardened.

## Example gallery

Audital is being explored as a reusable safety primitive for AI-powered work: compare an automated result with a trusted state, surface the exact deviation, perform only bounded remediation, then re-run the same invariant before calling the state fixed.

| Example | Audience | Demonstrates |
| --- | --- | --- |
| [01 — JSON precision](#example-01--two-different-json-integers-one-false-match) | Developers | A valid-looking pipeline can lose numeric identity and create a false match |
| [02 — 50-record payment batch](examples/02-payment-batch/) | Founders, agencies, operations | Grand totals can match while three records are wrong; local staging remediation fixes and reverifies all 50 |
| [03 — CRM sync drift](examples/03-crm-sync-drift/) | Founders, agencies, CRM/RevOps teams | A sync can report success while a customer is linked to the wrong company; approval, apply, read-back and re-verification are required before `REMEDIATED` |
| [04 — 10,000-SKU bounded autonomy](examples/04-ecommerce-bounded-autonomy/) | Founders, agencies, operations | 9,999 safe catalogue actions continue while one £499 → £49 price crash is isolated for approval |

The examples use fictional data and local execution. They do not claim live customer incidents or production writes.

## Example 01 — two different JSON integers, one false match

These two integer literals are different:

```text
9007199254740992
9007199254740993
```

After ordinary JavaScript `JSON.parse`, both can become the same `Number` because the values exceed the safe integer range.

A naive comparison can therefore say **PASSED** even though the source values differed.

### Try it in 10 seconds

Requires Node.js 20+.

```bash
node repro.mjs
node --test tests/repro.test.mjs
```

Expected core result:

```text
Naive equality: true
Validated string IDs differ: true
PASS: source representations differ even though naive Number comparisons collide.
```

Or open [`demo.html`](demo.html) directly in a browser. The demo uses fictional data and does not upload files.

## What this proves

- Raw numeric tokens can lose information when converted to JavaScript `Number` values.
- A downstream equality check can therefore produce a false match.
- Large identifiers should be preserved losslessly, for example as decimal strings, or parsed with an appropriate lossless strategy.
- If precision has already been lost, a verifier should not invent certainty. The safer state is **INDETERMINATE**.

## What this does **not** prove

- It does not prove that an AI model, n8n, Make, Zapier, Zod, or a real customer system caused an incident.
- It does not prove that schema validators cannot enforce custom business rules.
- It does not authenticate the source data.
- It does not certify an AI output as factually correct.
- It does not provide insurance coverage or a guarantee against loss.

## n8n learning example

[`n8n_example/workflow.json`](n8n_example/workflow.json) is a synthetic manual-trigger / Code-node example built around the same fictional invoice identifier.

The Code-node logic can be exercised outside n8n with:

```bash
node n8n_example/test_workflow.mjs
```

Expected state sequence:

```text
PASSED → INDETERMINATE → FAILED
```

The workflow JSON has not yet been verified inside a live n8n instance. Until that happens, this repository describes it as a simulation rather than a completed n8n integration.

## Audital 4.0 direction

The broader Audital 4.0 goal is to make a continuous safety loop easy enough to insert into normal AI and automation workflows:

```text
trusted reference + automated output
        ↓
       FIND
        ↓
bounded FIX where authorised
        ↓
      PROVE
        ↓
PASS / FAIL / INDETERMINATE / REMEDIATED
```

Production remediation is intentionally gated behind authorised connectors, policy boundaries, read-back verification, and the private fail-closed kernel.

The public examples are intentionally small. They are designed to be cloned, challenged, and reproduced without exposing Audital's private verification engine.

## Synthetic fixtures

All included records are fictional:

- [`fixtures/reference_original.json`](fixtures/reference_original.json)
- [`fixtures/reference_changed.json`](fixtures/reference_changed.json)
- [`fixtures/reference_as_strings.json`](fixtures/reference_as_strings.json)

No customer data, API credentials, private prompts, or proprietary Audital application source is included.

## Security and responsible disclosure

See [`SECURITY.md`](SECURITY.md).

## Licence

The original educational source in this repository is released under the [MIT License](LICENSE).
