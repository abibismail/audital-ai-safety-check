# Audital AI Safety Check

**Local second checks for AI-generated business data.** This public repository is the open, reproducible learning layer for Audital 4.0.

The idea is simple: valid JSON, a passing schema, or a green workflow run does not prove that a business-critical value stayed correct.

This repository starts with one narrow, reproducible failure mode. More synthetic safety checks can be added as they are independently tested.

> **Important:** this is not the proprietary Audital Guard or Audital Instant product source, and it is not a claim that Audital can detect every AI error. The commercial verification kernel remains private while it is hardened.

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

The broader Audital 4.0 goal is to make independent second checks easy enough to insert into normal AI and automation workflows:

```text
trusted reference + generated output → deterministic check → PASS / FAIL / INDETERMINATE
```

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
