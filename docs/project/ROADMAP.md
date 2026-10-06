# Roadmap

Roadmap IDs are stable. “Proceed” selects the first unblocked entry in `Ready / Now`. A feature is marked repository-complete separately from external deployment or live-verification gates.

## Product priorities

1. Receipt → recognize exact categories/amounts → create one verified transaction per supported category, with marked date/account suggestions when needed.
2. Review existing categories plus narrow retained receipt evidence → suggest more or less granular grouping → safely implement an explicitly approved structure.
3. Review granular history → suggest realistic savings with bounded evidence and no writes.

## Named maintenance work

### F-029 — Review and maintain authored skills

- User outcome: shorter discoverable skills with explicit connector dependencies, packaged storage constraints and synthetic fresh-run evaluation infrastructure.
- Scope: guidance/UI/reference packaging and opt-in evaluator only; preserve runtime code, exact financial previews, verified-only success, uncertain-write recovery and personal-evidence locality. F-025/F-026 remain paused; F-027 host baseline remains planned.
- Rollback: reverse the F-029 skill/tooling/documentation diff only, preserving pre-existing local evidence correction work and user changes.
- Validation: complete offline `npm run check`, package/metadata checks, fresh-run simulation/error tests and bootstrap projection/drift verification. No live mutation or actual model baseline is claimed.
- State: complete as skill/evaluator infrastructure; full offline `npm run check` passed on the isolated skill-maintenance snapshot on 2026-10-06 (86 application tests, 1 hosted test skipped; build, CLI/MCP smoke, fixture and six runner checks). Actual host/model behavior remains unverified and F-027 remains planned.


### F-028 — Correct local evidence consistency

- User outcome: repair supported local purpose labels and distinguish known, unknown, and mixed price bases without rewriting financial history.
- Acceptance: exact no-write preview; strict bounded stdin input; revision and plan-digest checks; private temporary rollback copy; atomic write and read-back verification; reject amount/category/identity changes and purpose collisions; expose basis-separated sums and partial/unknown coverage. Full offline checks and sanitized live-local verification required.
- Dependencies/traceability: F-017, F-023; VS-05 / C-17 evidence clarity. Named repair takes precedence without resuming F-025/F-026.
- Risks: source receipts may be unavailable; never infer missing price basis, split mixed groups, or change historical category facts. Old running MCP processes need restart for new aggregate annotations.
- Rollback: automatic in-lock restoration on a failed correction; temporary recovery copy stays only if recovery cannot be verified. Revert code independently of data annotations.
- State: complete; offline checks and authorized local correction verified. See [sanitized evidence](../evidence/2026-09-30-local-evidence-correction.md). Long-running MCP processes still need restart for the additive aggregate annotations.

## Ready / Now

Order remains F-025, then F-026. D-019 records authorization for all six self-awareness capabilities and one verified commit per capability; the pause after F-024 remains until the user asks to resume implementation. The 2026-09-09 roadmap revision changes planning only. Acceptance below is required future evidence, not a claim of implementation.

### F-025 — Guidance/version diagnostics

- User outcome: diagnose an outdated running connector or reported host guidance and identify what needs rebuilding, restarting, or refreshing without claiming to inspect the host.
- Delivery: an additive read-only diagnostic contract alongside the capability report. Report package version, running build identity, contract revision, and expected guidance revisions separately. Capture build identity during build from declared source inputs so same-version source changes are distinguishable; never identify a running process from the current checkout alone. Missing build metadata is explicitly unknown.
- Comparison rules: accept only bounded structured caller reports of known guidance IDs/revisions. Exact expected revision is `current`; a recognized older revision is `stale`; absent, unrecognized, or newer revisions are `unknown` with a reason. Revision comparison is not a claim of runtime compatibility or actual host loading. Reject malformed/oversized reports without echoing arbitrary input. A build identity mismatch is distinct from guidance revision status.
- Acceptance evidence: fixtures for equal/older/newer/unrecognized/absent revisions, partial reports, malformed/oversized input, and missing metadata; two builds with the same package version but changed declared source inputs have different identities; a running build keeps its identity after checkout changes. Local/hosted MCP calls expose consistent bounded output without provider calls or writes. Full `npm run check` and `git diff --check` pass.
- Dependencies: F-022 capability report, build pipeline, and installed workflow guidance. Source owners: [capabilities](../../src/capabilities.ts), [version](../../src/version.ts), [MCP server](../../src/server.ts), and [build script](../../package.json). Verification hooks: `tests/capabilities.test.ts`, `tests/mcp-contract.test.ts`, and build fixtures.
- Architecture/traceability: VS-03 / C-05 onboarding; VS-04 / C-09 diagnosis. Update the [self-awareness reference](../reference/self-awareness.md) and [behavior source map](../explanation/behavior-architecture.md); no new container or storage boundary is planned.
- Risks/rollback: reported guidance may be incomplete or false; expose its caller-reported origin. Never inspect host files or retain reports. Revert the additive feature, rebuild, and restart; no data migration.

### F-026 — Completion boundaries

- User outcome: know whether a receipt was only previewed, its financial operation verified, evidence retained, and an optional remote comment actually observed after the write.
- Delivery: additive, separate completion results for finance, receipt memory, and remote comments across category, reconciliation, and creation flows. Preserve existing result fields and financial validation. A preview describes intended effects only. Memory disabled/unavailable/no-groups outcomes must not be reported as evidence retained.
- Comment evidence: for new-receipt comments, compare the exact previewed text with every created part returned by the post-write read. Distinguish not requested/not applicable, verified, mismatch, and unavailable evidence. A financial `verified: true` alone never proves comment persistence. Existing-comment editing remains manual; do not add a repair write or duplicate expense.
- Failure/replay boundaries: preserve existing financial compensation and manual-review rules. Auxiliary evidence/comment status must not trigger a new financial action. Replay describes the previously verified result and that no new write occurred, without implying a fresh provider verification. A failed or uncertain write must not receive a successful completion claim; inspect the durable operation record before recovery.
- Acceptance evidence: category/no-op, reconciliation, and creation fixtures; preview without writes; memory stored/disabled/unavailable/no-groups; exact, omitted, altered, and partially matching split comments; cached replay; restart recovery; compensated failure and incomplete rollback/manual review. Verify that auxiliary reporting adds no writes or duplicate records. Full `npm run check` and `git diff --check` pass; use the read-only live doctor if implementation changes ZenMoney reads. Live comment persistence remains a separate, freshly authorized gate.
- Dependencies: F-010/F-011/F-012 receipt workflows, F-005 operation journal, F-017 memory, and F-019 comment guidance; follows F-025 under D-019. Source owners: [service](../../src/service.ts), [receipt results](../../src/receipt-operations.ts), and [receipt memory](../../src/receipt-memory.ts). Verification hooks: `tests/receipt-operations-service.test.ts`, `tests/receipt-memory.test.ts`, and `tests/mcp-contract.test.ts`.
- Architecture/traceability: VS-01 / C-02 verified receipt handling; VS-05 / C-17 evidence clarity. Update the receipt sequence in the [behavior source map](../explanation/behavior-architecture.md), the [self-awareness reference](../reference/self-awareness.md), and receipt workflow guidance; no new persistence boundary is planned.
- Risks/rollback: broad success wording can hide incomplete evidence; host behavior needs F-027 evaluation. Revert the additive reporting change, rebuild, and restart; do not undo verified expenses or purge retained evidence as a code rollback.

## Planned / Next

### F-027 — Evaluate receipt workflow outcomes

- User outcome: understand how reliably the named host completes receipt workflows, where corrections are needed, and whether its completion claims match observed results.
- State/dependencies: planned after F-025/F-026, using F-008 synthetic contract fixtures and F-021/F-023 provenance/coverage. Not yet in `Ready / Now`: select an available host/model, an isolated fixture backend, and a repeatable execution method before promotion. No live write or paid evaluation is authorized by this entry.
- Scope: a bounded baseline of at least 12 wholly synthetic image/PDF scenarios, each run three times. Include exact allocations, discounts, missing date/account, ambiguous match, unsupported evidence, confirmation refusal, memory disabled/unavailable, comment mismatch, replay, and failed-write reporting. Use known expected tool outcomes and a fixed scoring rubric; keep host interpretation separate from deterministic contract results.
- Measures: report exact extraction/allocation accuracy against ground truth; cases requiring correction / attempted cases; verified completions / eligible cases; time from receipt presentation to final outcome (report failures/timeouts separately); unsupported completion claims / completion claims; duplicate writes and writes without confirmation. Record sample size, exclusions, build/guidance/model identity, date, and tool environment.
- Acceptance evidence: repeatable run instructions, synthetic fixtures, per-case scores and aggregate denominators, and a prioritized list of observed failures. Zero duplicate writes, writes without confirmation, or unsupported success claims is the safety gate; failures block a passing evaluation and create remediation work. Accuracy and duration establish a baseline, not an invented improvement target. Record model/host execution as blocked if unavailable; deterministic simulation alone cannot close this feature.
- Owner/promotion: project maintainer selects the host and reviews the fixture/rubric packet after F-026. No external operator is assumed. Representative real-receipt evaluation needs a separately agreed consent, storage, retention, and sampling plan outside the checkout; this synthetic baseline cannot establish real-world OCR accuracy.
- Architecture/traceability: VS-01 / C-11 extraction quality and C-02 verified completion; VS-05 / C-17 evidence clarity. Extend the existing evaluation boundary in [behavior architecture](../explanation/behavior-architecture.md); no production component or telemetry collection. Dependencies include a separate host evaluation harness, not merely `npm run eval:receipts`.
- Risks/rollback: small synthetic samples and model variability limit generalization. Store only synthetic fixtures and sanitized engineering results in the repository, never personal receipts, candidates, or financial summaries. Remove the evaluation artifacts to roll back; no production state changes.

## Externally gated

### F-014 — Operated hosted ChatGPT connector

- Repository outcome: complete. Direct Streamable HTTP `/mcp`, protected-resource metadata, OAuth bearer validation, tenant-bound sessions, encrypted ZenMoney credentials, owned-client link/unlink lifecycle, Docker/Render deployment, policy templates, threat model, and publication checklist are implemented.
- Remaining gates: choose an operator and budget; configure an external OAuth identity provider; obtain an owned ZenMoney OAuth client and verify its current PKCE/refresh/revocation contract; publish real privacy/terms/support contacts; deploy staging; complete MCP Inspector and private ChatGPT discovery; establish incident response and operator telemetry.
- Evidence needed to close deployment: hosted health/auth/discovery logs, tenant isolation tests against staging, one freshly authorized live link/read, and a human-recorded ChatGPT tool-discovery result.
- Owner: service operator unassigned; project maintainer must name one before deployment. Next action: record operator, budget, identity provider, and staging configuration plan using the [deployment guide](../how-to/deploy-hosted.md). Mock/local preparation can proceed independently; live owned-client readiness depends explicitly on F-007. Reopen staging execution when prerequisites and its plan are reviewable; close only with the dated evidence above. Risk: external exposure and ongoing cost; repository completion is not deployment approval.

### F-007 — Live ZenMoney OAuth compatibility

- Repository outcome: encrypted per-tenant authorization, refresh, revocation, relinking, S256 PKCE, one-time state, and tests are complete.
- Blocker: ZenMoney application registration/approval and authoritative live confirmation of its current OAuth contract.
- Rule: do not silently remove PKCE or share a personal access token across tenants.
- Owner: owned-client registrant unassigned; project maintainer must identify the registrant. Next action: obtain application approval and authoritative provider contract evidence. Reopen compatibility verification when client/redirect configuration and a credential-safe test plan are available. Close with dated authorization-code/state/PKCE, refresh, revocation, and relink evidence; failures continue to block F-014 live readiness.

### F-016B — Budget-aware category consolidation

- Prerequisite F-016 is repository-complete for transactions, reminders, and reminder markers. F-016B budget support is not implemented. The connector performs complete-reference discovery, exact preview, durable journaling, stale-reference checks, source retirement, verification, and concurrency-safe compensation for the supported references.
- Blocker: the pinned ZenMoney backend exposes budgets read-only and the public API documentation does not establish safe move/delete semantics.
- Current behavior: if a source category has any budget reference, preview returns `applyAvailable: false` and no apply token. Clear or move the budget in ZenMoney, then create a fresh preview.
- Evidence needed for budget support: authoritative schema/semantics, fixture tests, restart/conflict tests, and separately authorized live create/migrate/cleanup evidence.
- Owner: project maintainer for contract review; provider confirmation is external. Next action: obtain authoritative budget move/delete and conflict semantics, then review the pinned backend against them. Reopen implementation only with a reviewed complete migration/compensation plan. No partial merge, guessed semantics, or automatic budget clearing is allowed.

### F-014P — Public distribution

- Optional future outcome: publish the connector beyond a verified private hosted setup after F-014 is closed.
- Dependencies: every `F-014` gate plus production privacy/terms/support URLs, abuse controls, deletion process, service ownership, SLOs, incident response, and OpenAI review requirements current at submission time.
- Boundary: public discoverability is not required for the user's private hosted setup.
- Owner: publication sponsor/operator unassigned. Next action only after an explicit public-distribution decision: assign owners and dated evidence to the [publication checklist](HOSTED_PUBLICATION_CHECKLIST.md). Reopen after that decision and F-014 completion; public release remains blocked until every checklist gate is satisfied. No submission or publication is authorized by this roadmap.

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
