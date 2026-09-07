# Roadmap

Roadmap IDs are stable. “Proceed” selects the first unblocked entry in `Ready / Now`. A feature is marked repository-complete separately from external deployment or live-verification gates.

## Product priorities

1. Receipt → recognize exact categories/amounts → create one verified transaction per supported category, with marked date/account suggestions when needed.
2. Review existing categories plus narrow retained receipt evidence → suggest more or less granular grouping → safely implement an explicitly approved structure.
3. Review granular history → suggest realistic savings with bounded evidence and no writes.

## Ready / Now

- `F-025` guidance/version diagnostics: identify running build/contract and compare explicitly reported host guidance without claiming to inspect the host. Depend on capability report. Acceptance: current/stale/unknown and malformed report tests.
- `F-026` completion boundaries: distinguish preview, verified finance, retained evidence, and verified remote comments. Depend on receipt apply and memory results. Acceptance: success, disabled/unavailable memory, replay and failed-write cases.

All six self-awareness capabilities are user-authorized for implementation, with one verified commit per capability. Traceability: VS-03 / C-05 private onboarding, VS-04 / C-09 diagnosis, VS-05 / C-17 evidence clarity.

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

### F-024 — Explicit local preference memory

- Outcome: inspect and explicitly remember finite categorization choices across local sessions, with exact enable/set/edit/delete/disable/purge controls and no financial rewrite.
- Acceptance: default-off/no-write preview, immutable plan, confirmation, replay/restart/expiry, digest conflicts, permissions, symlink/corruption/size/lock and invalid-input tests; hosted isolation; full offline check.
- Dependencies: operation preview store and private filesystem. Boundaries: no free-form instructions or personal financial fields; preferences advise host decisions; hosted mode unsupported; corrupt storage/stale crash locks fail closed for operator inspection. Traceability: VS-03 / C-05 and VS-05 / C-17.

### F-023 — Evidence coverage

- Outcome: distinguish retained/returned evidence and observed periods from complete spending history. Memory counts distinct receipts; summaries separate excluded records and source/display bounds.
- Acceptance: empty, expired, filtered, truncated, multi-purpose and bounded-month fixtures; full offline suite and read-only live doctor. No new persisted data or changed read selection. Dependencies: bounded memory and summary reads. Traceability: VS-05 / C-17; VS-06 / C-13.

### F-022 — Effective capability report

- Outcome: read-only MCP capability report distinguishes mode, configuration, unsupported actions and evidence availability from live verification and unknown host state.
- Acceptance: local/hosted/unconfigured/corrupt/failing-store fixtures, real MCP discovery/call contract and full offline suite. Dependencies: existing status and memory contracts; no API reads or writes added. Traceability: VS-03 / C-05.

### F-021 — Decision provenance

- Outcome: explain receipt defaults, caller category/allocation choices, match ambiguity, and upstream suggestions by their actual source.
- Evidence: additive provenance in service outputs, synthetic service tests for supplied/defaulted/no-match decisions, full offline check. Existing amount/category/confirmation rules are unchanged.
- Dependencies: receipt service and existing recommendation helpers. Risk: attribution covers server-observable facts, not host reasoning or OCR correctness. Traceability: VS-03 / C-05 and VS-05 / C-17.

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

### F-019 — Evidence storage self-awareness

- User outcome: after cloning and beginning receipt/category work, understand where retained evidence lives, keep personal data out of the repository, and know how to keep optional category-candidate notes remotely in ZenMoney comments.
- Delivery: README and memory-guide sections, repository operating contract, receipt/category skills, and MCP instructions. Report actual status/location/retention at first relevant session use; distinguish local MCP storage from hosted tenant storage and from ZenMoney comments.
- Acceptance evidence: source review against memory location/hosted storage and comment contracts; full offline `npm run check`; skill metadata validation; `git diff --check`. Guidance covers unavailable/disabled memory without fallback files, clone portability, remote-note deletion independence, preserving existing comments, and exact confirmation for new-receipt comments.
- Dependencies: `F-017` managed receipt memory, `F-012` existing optional new-receipt comment input, and `F-009` category-review workflow.
- Risks/boundaries: host models must follow the guidance; it is not filesystem enforcement. No automatic remote backup, comment editing of existing expenses, or new live write surface. A receipt-level comment is repeated on each created split part; comments do not count toward local readiness. Live comment persistence and model behavior are not verified by the offline suite.
- Traceability: VS-03 private onboarding / C-05 and VS-05 category clarity / C-17. Repository complete; restart the MCP and refresh installed skills to load the updated guidance.

### F-020 — Behavior architecture and source ownership

- User outcome: answer “where does this behavior come from?” and locate the right guidance, interface, rule, or integration before making a change.
- Delivery: source-linked component and dynamic Mermaid views, a behavior-owner lookup, local/hosted interface and storage boundaries, and a diagnostic path linked from README and existing architecture docs.
- Acceptance evidence: check diagram syntax/rendering and source-link targets; trace claims to schemas, handlers, helpers, stores, host skills, and entrypoints; run `npm run check` and `git diff --check`.
- Dependencies: implemented receipt/taxonomy/memory workflows and `F-019` locality guidance. Traceability: VS-02 / C-04 development continuity; VS-03 / C-05 onboarding.
- Risks/boundaries: documentation can drift; host instruction loading and human consent remain host responsibilities. No claim of filesystem enforcement, autonomous review scheduling, live deployment, or measured model adherence.
- State: repository documentation complete; implementation and financial state unchanged.

## Dispositioned ideas

- Cross-platform credentials: local environment injection works on every supported platform; native OS adapters remain a contribution opportunity, not a current user blocker. Hosted mode uses encrypted tenant storage.
- Supervised tunnel: removed and declined; no active roadmap item may reintroduce it without a new decision.
- Merchant/category learning: not retained because merchant/product storage conflicts with the current minimal-data boundary. Confirmed narrow-purpose receipt memory supplies the safe learning signal instead.
- Category icon/picture/color: deferred until ZenMoney exposes a portable, documented writable contract and preview rendering can be verified.
