# Example 05 — Universal Engine Showcase

> **Public educational reference:** the small `audital.protect()` implementation here is a standalone synthetic teaching version of the lifecycle. It is **not** Audital's private kernel, an officially distributed SDK, an API gateway, or a production-ready execution engine.

**Context belongs to the application. Lifecycle guarantees belong to Audital.**

The application owns the state, intent, authority boundary and postconditions. The reference executor runs the same five-step lifecycle regardless of what the action does. Its interface does not enumerate industries or supported vendors.

| Application-defined case | Local synthetic action | Verification |
| --- | --- | --- |
| JSON event payload | Correct one fictional customer ID | Customer ID matches; event ID and amount remain unchanged |
| Deployment rollback | Restore a synthetic revision | Revision matches the expected version and service health is `HEALTHY` |
| Token revocation | Disable a completely fake token | Revocation and effective grants match; unrelated token retains access |

All three run concurrently through one `audital.protect({ contract, adapter })` primitive via `Promise.all` in `runShowcase()`. Each has its own independent adapter and proof rule.

## Run locally

Requires Node.js 20+ and no packages, secrets or API keys.

```bash
node examples/05-universal-engine-showcase/run-check.mjs
node --test examples/05-universal-engine-showcase/test.mjs
```

Expected result:

```text
JSON payload repair: REMEDIATED
Deployment rollback: REMEDIATED
Token revocation: REMEDIATED
Network writes: 0
```

## Same lifecycle, arbitrary context

```text
READ → PREPARE → AUTHORIZE → APPLY → AUTHORITATIVE READ-BACK → REVERIFY
```

The local example binds authorisation to a SHA-256 fingerprint of the workflow, resource, destination, policy/version, starting version and proposed action. Individual adapters use conditional versions before changing local state. A write acknowledgement cannot create `REMEDIATED` unless an application-supplied assertion passes on the read-back state.

Tests also prove that unbound approval blocks writes, an acknowledged but ineffective write fails verification, an ambiguous timeout produces `OUTCOME_UNKNOWN`, and unsafe large numeric input is refused before authorisation.

## Boundaries that matter

- **No real integrations:** no cloud provider, CRM, payment processor, identity provider, network request or customer data is involved.
- **No claim of independent trust:** the teaching executor relies on adapter-supplied state, permission decisions and postconditions. A compromised or incorrect adapter could lie.
- **No signed attestation:** the local SHA-256 receipt checks deterministic encoding only; it is not a digital signature, trusted timestamp or proof of external state.
- **No production scalability claim:** `Promise.all` over three local examples does not demonstrate rate-limit handling, durable scheduling, persistent journals, compare-and-swap against live APIs or bypass-resistant credential isolation.
- **No private source released:** the commercial Audital kernel is a separate private implementation that remains subject to its own security and integration release gates.

To imagine another application, supply another contract and adapter rather than changing the executor's list of industry types. That extensibility is what this example illustrates.
