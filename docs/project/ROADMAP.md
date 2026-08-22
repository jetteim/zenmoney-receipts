# Roadmap

Roadmap IDs are stable. “Proceed” selects the first unblocked entry in `Ready / Now`. A feature is marked repository-complete separately from external deployment or live-verification gates.

## Product priorities

1. Receipt → recognize exact categories/amounts → create one verified transaction per supported category, with marked date/account suggestions when needed.
2. Review existing categories plus narrow retained receipt evidence → suggest more or less granular grouping → safely implement an explicitly approved structure.
3. Review granular history → suggest realistic savings with bounded evidence and no writes.

## Ready / Now

There is no unblocked repository implementation item. “Proceed” should select the first item whose external prerequisite has become available, or refine a newly requested feature.

## Externally gated

### F-014 — Operated hosted ChatGPT connector

- Repository outcome: complete. Direct Streamable HTTP `/mcp`, protected-resource metadata, OAuth bearer validation, tenant-bound sessions, encrypted ZenMoney credentials, owned-client link/unlink lifecycle, Docker/Render deployment, policy templates, threat model, and publication checklist are implemented.
- Remaining gates: choose an operator and budget; configure an external OAuth identity provider; obtain an owned ZenMoney OAuth client and verify its current PKCE/refresh/revocation contract; publish real privacy/terms/support contacts; deploy staging; complete MCP Inspector and private ChatGPT discovery; establish incident response and operator telemetry.
- Evidence needed to close deployment: hosted health/auth/discovery logs, tenant isolation tests against staging, one freshly authorized live link/read, and a human-recorded ChatGPT tool-discovery result.

### F-007 — Live ZenMoney OAuth compatibility

- Repository outcome: encrypted per-tenant authorization, refresh, revocation, relinking, S256 PKCE, one-time state, and tests are complete.
- Blocker: ZenMoney application registration/approval and authoritative live confirmation of its current OAuth contract.
- Rule: do not silently remove PKCE or share a personal access token across tenants.

### F-016B — Budget-aware category consolidation

- Repository outcome: complete for transactions, reminders, and reminder markers. The connector performs complete-reference discovery, exact preview, durable journaling, stale-reference checks, source retirement, verification, and concurrency-safe compensation.
- Blocker: the pinned ZenMoney backend exposes budgets read-only and the public API documentation does not establish safe move/delete semantics.
- Current behavior: if a source category has any budget reference, preview returns `applyAvailable: false` and no apply token. Clear or move the budget in ZenMoney, then create a fresh preview.
- Evidence needed for budget support: authoritative schema/semantics, fixture tests, restart/conflict tests, and separately authorized live create/migrate/cleanup evidence.

### F-014P — Public distribution

- Optional future outcome: publish the already hosted connector beyond a private ChatGPT setup.
- Dependencies: every `F-014` gate plus production privacy/terms/support URLs, abuse controls, deletion process, service ownership, SLOs, incident response, and OpenAI review requirements current at submission time.
- Boundary: public discoverability is not required for the user's private hosted setup.

## Completed

- `F-001` durable ephemeral-session handoff.
- `F-002` agent-safe installer, secure macOS auth helper, structured doctor/schema, and idempotent host registration.
- `F-003` retired: laptop tunnel tooling was removed by product decision; direct hosted HTTP supersedes it.
- `F-004` CI, dependency/security/documentation policy, and repository validation baseline.
- `F-005` permission-restricted minimal crash journal, deterministic operation IDs, restart classification, and recovery inspection.
- `F-006` allowlisted bounded operational events, support bundle, doctor checks, and troubleshooting guide.
- `F-007` repository OAuth lifecycle; live provider compatibility remains externally gated above.
- `F-008` host-neutral extraction contract plus ten-case synthetic regression corpus and metrics runner. It validates contract handling, not OCR/model accuracy.
- `F-009` read-only category granularity review.
- `F-010` receipt match/category-only flow.
- `F-011` exact existing-expense reconciliation/split.
- `F-012` missing-receipt creation with verified cleanup-tested E2E.
- `F-013` bounded per-instrument spending insights and savings workflow.
- `F-014` repository-hosted foundation; actual operation remains externally gated above.
- `F-015` bounded taxonomy create/update/retire flows.
- `F-016` safe no-budget category consolidation; budget support remains `F-016B`.
- `F-017` opt-in, bounded, sanitized receipt-evidence memory and automatic read-only review readiness.
- `F-018` fast marked missing-date/account suggestions.

## Dispositioned ideas

- Cross-platform credentials: local environment injection works on every supported platform; native OS adapters remain a contribution opportunity, not a current user blocker. Hosted mode uses encrypted tenant storage.
- Supervised tunnel: removed and declined; no active roadmap item may reintroduce it without a new decision.
- Merchant/category learning: not retained because merchant/product storage conflicts with the current minimal-data boundary. Confirmed narrow-purpose receipt memory supplies the safe learning signal instead.
- Category icon/picture/color: deferred until ZenMoney exposes a portable, documented writable contract and preview rendering can be verified.
