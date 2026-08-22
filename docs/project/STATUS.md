# Project status

Last updated: 2026-08-22

Current version: 0.7.0

Deployment targets: private single-user local stdio; repository-ready direct hosted Streamable HTTP. No tunnel mode.

## Current outcome

The local connector supports the three primary workflows: one verified expense per receipt-supported category; category review and safe taxonomy changes informed by opt-in narrow receipt evidence; and bounded read-only savings suggestions. Missing receipt dates/accounts are marked suggestions in the exact preview. Every ZenMoney write remains previewed, explicitly confirmed, concurrency-checked, journaled, and post-write verified.

Version 0.7.0 adds durable recovery inspection, privacy-safe diagnostics, safe category consolidation, a synthetic extraction contract pack, and a separately deployable multi-tenant HTTP/OAuth boundary. Hosted source and deployment artifacts are ready, but no production service or ChatGPT connection is claimed.

## Verification baseline

- Offline unit/contract/adversarial tests, typecheck, bundle, stdio smoke, synthetic extraction evaluation, and repository validation are required on every change.
- Historical live evidence: read-only sync, synthetic write/cleanup, one user-confirmed receipt creation, savings insights, and selected taxonomy create/update paths are recorded under `docs/evidence/` without financial payloads.
- v0.7.0 evidence belongs in `docs/evidence/2026-08-22-v0.7.0-roadmap-completion.md`; it explicitly separates offline, read-only live, hosted-process, container, CI, and externally unverified results.

## External setup state

- Local ZenMoney credential: configured on the maintainer machine and never stored in the repository.
- Local Codex runtime: intended default personal workflow.
- Hosted deployment: not provisioned. The code needs an operator, persistent encrypted storage, external OAuth identity provider, owned ZenMoney OAuth application, real policies/support contact, and staging verification.
- ChatGPT connection: not installed or verified. A human must complete private staging discovery after deployment.
- Public distribution: optional and explicitly out of current scope.

## Next actionable item

There is no unblocked repository feature left from the current roadmap. Continue with one of:

1. provide the external prerequisites and execute `F-014` staging;
2. obtain authoritative ZenMoney budget-write semantics for `F-016B`; or
3. add a new feature to `ROADMAP.md` with outcome, acceptance evidence, dependencies, and risks.

## Known limits

- Unapplied preview tokens are process-local and expire; the persistent journal supports recovery of started operations, not reuse of stale previews.
- Category consolidation refuses any source referenced by a budget. It does not guess or partially migrate.
- ZenMoney's public API documentation has known drift; live verification remains a release gate after backend/API changes.
- Live taxonomy retirement/restore and v0.7.0 consolidation remain unverified because this work did not have fresh authorization for live writes.
- The synthetic extraction pack verifies structured-facts contract behavior, not host OCR/model accuracy on real receipts.
- Receipt evidence is prospective, bounded, and default-off. It stores no receipt/OCR, merchant, product, transaction ID, or raw response and cannot backfill old receipts.
- Local receipt evidence is permission-protected but not application-encrypted. Hosted credential envelopes are encrypted; other hosted state still requires the configured encrypted persistent disk.
- The provided Render profile is deliberately single-instance. Disk-backed state and in-memory MCP sessions do not support horizontal scaling or zero-downtime deployment without a redesigned shared-state/session layer.
- Privacy-safe local events are support diagnostics, not a complete hosted telemetry/SLO backend. Operator ownership and telemetry are publication gates.
