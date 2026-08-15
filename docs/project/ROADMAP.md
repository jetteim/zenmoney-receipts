# Roadmap

Roadmap IDs are stable. “Proceed” selects the first unblocked entry in `Ready / Now`.

## Product priorities

1. Receipt → recognize exact categories/amounts → create one verified transaction per category (`F-012`, complete).
2. Review existing categories → suggest more or less granular grouping (`F-009`, complete and read-only).
3. Review granular history → suggest realistic savings with evidence (`F-013`, complete and read-only).

## Ready / Now

### F-005 — Crash-safe financial operations

- Outcome: after a server restart or host crash, an authorized reconciliation/create operation can be classified as not started, completed, compensated, or requiring manual review without duplicating writes.
- Acceptance evidence: persistent operation journal tests covering crash points; restart/idempotency integration test; migration/retention/security notes; opt-in live evidence only with fresh user authorization.
- Dependencies: C-03 receipt operations; existing preview plan hashes and concurrency versions.
- Risks: journal could contain financial metadata; minimize/redact fields and protect local permissions.
- First slice: `S-005A` design and implement a local, permission-restricted operation receipt journal with deterministic recovery inspection.

### F-006 — Privacy-safe observability and support bundle

- Outcome: operators can diagnose startup, tunnel, backend, and mutation-phase failures without exposing credentials or financial payloads.
- Acceptance evidence: structured event schema, redaction/adversarial tests, bounded support-bundle command, troubleshooting guide.
- Dependencies: F-005 operation phases.
- Risks: logs become a data-exfiltration path unless allowlisted.

## Next

### F-007 — ZenMoney OAuth lifecycle

- Outcome: owned OAuth client flow supports authorization, refresh, revocation, and relinking without manual token replacement.
- Acceptance evidence: registered ZenMoney client, PKCE/state tests where supported, encrypted refresh storage, expiration/revocation tests.
- Blocker: ZenMoney application registration/approval and authoritative confirmation of the current OAuth contract.

### F-008 — Receipt extraction evaluation pack

- Outcome: host agents reliably produce the structured receipt facts needed by the MCP across photos, PDFs, currencies, discounts, and mixed-category receipts.
- Acceptance evidence: privacy-safe synthetic corpus, host-neutral prompt contract, precision/ambiguity metrics, regression runner.
- Dependency: no raw user receipts in source control.

## Completed

- `F-001` durable ephemeral-session handoff (`AGENTS.md` plus project status/roadmap/decisions/traceability).
- `F-002` agent-safe installer, secure macOS auth helper, structured doctor/schema, idempotent host registration.
- `F-003` private ChatGPT tunnel plan/init/doctor/run tooling and checksum-verified official client installer.
- `F-004` CI, dependency updates, security/contribution policy, documentation structure, and repository validation baseline.
- `F-010` receipt match/category-only flow.
- `F-011` existing-expense reconciliation and exact split.
- `F-012` missing-receipt creation with cleanup-tested live E2E.
- `F-009` read-only category granularity review with instrument-safe grouping rules.
- `F-013` bounded per-instrument spending insights and evidence-based savings workflow.

## Later / Ideas

- Cross-platform OS credential-store adapters.
- Optional supervised tunnel service with explicit local lifecycle controls.
- Merchant/category learning based on user-confirmed outcomes, with an inspectable local model and deletion controls.
- Category create/rename/archive remains deliberately deferred until safe migration semantics and explicit user demand exist.
