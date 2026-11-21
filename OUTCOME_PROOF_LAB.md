# Audital Outcome Proof Lab — public synthetic demonstration

**Audience:** builders of AI agents, GitHub Actions, n8n, deployment automations, and workflow orchestrators.

**Open `outcome-proof-lab.html` in a browser**. This HTML file runs locally with no server, account, package installation, outbound network access, credentials, or mutations. It's a *teaching fixture*, not the private Audital Guard engine.

## What this demonstrates

A 200 OK and a closed issue are insufficient evidence that a particular authorized workflow execution caused the closure. The state machine in this teaching fixture separates an external success response from the requirements for a justified status.

Select and run each fixture:

| Synthetic test | Outcome | Why |
| --- | --- | --- |
| Closed ≠ proven | `NEEDS_VERIFICATION` | Closed state and successful provider response, but no reliable run-specific attribution |
| Replay | `BLOCKED` | Single-use claim already consumed; nothing dispatched |
| Expired approval | `BLOCKED` | No valid authority at preflight; nothing dispatched |
| Readback unavailable | `NEEDS_VERIFICATION` | A write may have occurred, but independent state is unavailable |
| Complete *synthetic* proof | `VERIFIED` in `SIMULATED` mode only | All fixture flags indicate an internally consistent outcome, not proof of a real action |

You can flip each checkbox and re-evaluate the result. In particular, flip *Run-specific causation established* off in the final fixture and verify that the simulated result becomes `NEEDS_VERIFICATION`.

**Important distinctions:** the values are *untrusted fixture flags*. The UI does not verify cryptographic signatures, enforce trusted identities, call GitHub, or prove distributed correctness. The simulated `VERIFIED` result **must never be represented as a real Guard acceptance result**.

## Reproducible tests

Requires Node.js 22 (no npm install):

```bash
node --test tests/outcome-proof-lab.test.mjs
```

Twelve tests cover outcomes, ambiguous effects, absence of readback, missing causation, and the no-network/static disclaimer contract. GitHub Actions runs this suite in the public repo on pull requests.

## Feedback request

Did your workflow claim success while a remote action failed, changed the wrong resource, was replayed, or could not be attributed to a specific run? Please [open an issue](https://github.com/abibismail/audital-ai-safety-check/issues/new) with:

1. Your workflow type (e.g. GitHub Actions, n8n, agent loop).
2. The external effect you expected and how you verified it.
3. The actual observed failure, and whether it happened more than once.
4. What protection would be worth paying for, if anything.

**Never post credentials, customer records, access tokens, or private repository data**. A fictional reproduction is ideal.

## Public vs private boundaries

The public Outcome Proof Lab is the **free educational preview**. It has no real connector, production action, signing keys, or payment system. Audital's protected seven-service Guard execution path remains under separate independent acceptance review. This demo does **not** promote any of its G01–G12 release gates.
