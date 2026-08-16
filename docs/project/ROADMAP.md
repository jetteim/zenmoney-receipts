# Roadmap

Roadmap IDs are stable. “Proceed” selects the first unblocked entry in `Ready / Now`.

## Product priorities

1. Receipt → recognize exact categories/amounts → create one verified transaction per category with marked date/account suggestions when needed (`F-012` and `F-018`, complete).
2. Review existing categories → suggest more or less granular grouping, then safely implement requested structural changes (`F-009` and `F-015`, complete; bulk history merge deferred to `F-016`).
3. Review granular history → suggest realistic savings with evidence (`F-013`, complete and read-only).

## Ready / Now

### F-014 — Hosted ChatGPT connector and publication path

- Outcome: ChatGPT can use the receipt/category/savings workflows without the user's laptop, with a separately deployed connector suitable for eventual public distribution.
- Acceptance evidence: hosted Streamable HTTP MCP; MCP OAuth 2.1 metadata/PKCE/token validation; owned ZenMoney OAuth client with encrypted per-user refresh storage; tenant-isolation and deletion tests; privacy/support policies; staging ChatGPT tool discovery; production publication checklist.
- Production dependencies: ZenMoney application registration/approval, hosting/provider decision and budget, public privacy/terms/support contacts, F-005 crash-safe operations, and F-006 privacy-safe observability. `S-014A` is unblocked and must resolve these choices before implementation begins.
- Risks: custody of financial credentials/data, multi-tenant isolation, API drift, billing, abuse/rate limits, incident response, and materially larger compliance scope.
- First slice: `S-014A` write the hosted threat model, auth sequence, C4 deployment view, provider/cost decision, and staging plan without handling real user credentials.
- Boundary: a remote private connector can remove the laptop dependency before public publication; distribution visibility and hosting are separate decisions.

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

### F-016 — Crash-safe category consolidation

- Outcome: merge one source category into a target across all transaction, reminder, and budget references, then retire or remove the empty source without partial migration.
- Acceptance evidence: complete-reference discovery; durable journal/restart tests; optimistic-concurrency conflict tests; exact preview with affected counts; compensation/manual-review states; separately authorized synthetic live create/merge/cleanup evidence.
- Dependencies: `F-005` persistent operation journal and authoritative confirmation of ZenMoney reminder/budget deletion semantics.
- Risks: incomplete history bounds, concurrent edits, invisible reminder/budget references, and destructive source deletion.

### F-017 — Opt-in local receipt evidence memory

- Outcome: fresh local-agent sessions can use prior user-approved receipt group evidence to recommend durable category granularity without storing raw images, PDFs, full OCR text, or credentials.
- Acceptance evidence: privacy/schema decision; explicit enablement; permission-restricted and size-bounded local store; sanitized structured group records; idempotent recording after verified receipt writes; bounded inspect/search; per-record and full purge; retention controls; corrupt/concurrent-file tests; uninstall/data-location documentation.
- Dependencies: decide whether at-rest OS encryption is required and align lifecycle events with `F-005`/`F-006` without placing receipt content in operational logs.
- Risks: product/health/location inference from item groups, prompt injection in stored labels, unbounded accumulation, stale classification learning, and user surprise if persistence is implicit.
- Boundary: disabled by default; never store the receipt artifact or arbitrary OCR. Current-session receipt comparison remains available without this feature.

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
- `F-012` missing-receipt creation with cleanup-tested live E2E and a separately confirmed live single-category receipt operation on 2026-08-16.
- `F-009` read-only category granularity review with instrument-safe grouping rules.
- `F-013` bounded per-instrument spending insights and evidence-based savings workflow.
- `F-015` bounded taxonomy create, rename, reparent, behavior, restore, and retirement preview/apply flows; confirmed live create/update/transaction-category evidence recorded on 2026-08-15, with retirement and restore still live-unverified.
- `F-018` fast missing-field receipt previews: host-local-today date suggestion, bounded semantic/history account recommendation, and exact `suggestedFields` provenance labels without weakening confirmation.

## Later / Ideas

- Cross-platform OS credential-store adapters.
- Optional supervised tunnel service with explicit local lifecycle controls.
- Merchant/category learning based on user-confirmed outcomes, with an inspectable local model and deletion controls.
- Category visual customization (icon, picture, and color) after portable validation and preview rendering exist.
