# Project status

Last updated: 2026-08-17

Current version: 0.6.0

Deployment target: private single-user local MCP; optional private ChatGPT Secure MCP Tunnel

## Current outcome

The connector supports the prioritized product workflows: create one expense per receipt-supported category, match/correct existing expenses, review and safely modify category taxonomy, and produce bounded history evidence for saving suggestions. Missing receipt dates/accounts become visibly marked preview suggestions instead of extra questions. Opt-in local receipt memory now retains only exact confirmed narrow purpose groups after financial verification and automatically requests a read-only granularity review after the same purpose recurs in three receipts. Receipt and taxonomy writes use explicit preview/confirmation, optimistic concurrency, and post-write verification.

## Verified baseline

- Offline unit/contract tests, typecheck, production bundle, stdio smoke, and repository validation: required on every change.
- Live read-only synchronization: passed on 2026-08-15 with 79 active categories and no financial records printed.
- Opt-in synthetic write E2E: passed 4/4 on the final v0.3.0 build on 2026-08-15; all exact generated IDs were deleted and cleanup verified.
- User-confirmed receipt creation: one live no-match receipt was previewed, confirmed, created, and independently read back on 2026-08-16 without recording financial payloads in evidence.
- Live savings-insights read: passed over a non-truncated 90-day sample; only counts were logged.
- Codex local MCP registration: configured against this repository build on the maintainer machine.
- Fresh ephemeral Codex session: connection status and read-only synchronization passed with the Keychain credential; no financial records were printed.
- Proactive Codex workflows: receipt/category/savings skills are installed in the maintainer's Codex profile, validate successfully, and the installer is idempotent. New sessions can use receipt attachments or short intents instead of workflow prompts.
- Taxonomy management: fixture-backed preview/apply, stale-write, hierarchy, retirement, idempotency, and MCP contract tests pass. A separately confirmed live operation on 2026-08-15 verified two creates, six allowlisted updates, and 26 exact transaction-category replacements with post-write read-back; retirement and restore remain live-unverified.
- Fast receipt defaults: omitted date/account inputs produce an exact host-local-today/account recommendation preview and mark only inferred fields with basis/confidence; fixture-backed matching, ranking, fallback, and adversarial-input tests pass.
- Local receipt memory: fixture-backed permission, atomicity, idempotency, retention, concurrency, corruption recovery, hostile-label, exact deletion/purge, MCP schema, and verified-receipt integration tests pass. Broad `Produce` evidence is rejected in favor of narrow durable purposes. The maintainer installation is enabled with 180-day retention; no live financial write was needed for this local feature.

Evidence: `docs/evidence/2026-08-15-v0.3.0-verification.md`, `docs/evidence/2026-08-15-v0.4.0-taxonomy-verification.md`, `docs/evidence/2026-08-15-live-taxonomy-operation.md`, `docs/evidence/2026-08-16-live-receipt-operation.md`, `docs/evidence/2026-08-16-v0.5.0-fast-receipt-defaults.md`, `docs/evidence/2026-08-17-v0.6.0-receipt-memory.md`, and `docs/e2e-test-log-2026-08-15.md`. New release/live evidence belongs in `docs/evidence/` and must be sanitized.

## External setup state

- ZenMoney credential: configured on the maintainer machine; never stored in the repository.
- Personal runtime choice: local Codex stdio MCP. The attempted local ChatGPT tunnel runtime/profile was stopped and removed after a malformed runtime key; the remote tunnel remains account-side until manually deleted.
- Hosted ChatGPT connector: requested as a future separately deployed/public product; it is not implemented or installed. See `F-014` in the roadmap.
- GitHub publishing: source is intended to be publicly cloneable; financial connections remain private per installation.

## Next actionable item

`F-014 / S-014A` — design the hosted connector threat model, authentication sequence, deployment/provider decision, cost envelope, and staging/publication plan. No real user credentials are handled in this slice. See `ROADMAP.md`.

## Known limits

- ZenMoney access-token acquisition/refresh is manual.
- Preview and apply-result idempotency state is process-local; restart invalidates previews and loses completed-result replay state.
- Compensating rollback is scoped and concurrency-safe but cannot guarantee recovery after process/host failure mid-operation.
- Private ChatGPT availability depends on the local machine, tunnel process, and OpenAI workspace policy.
- ZenMoney's public API documentation is old and has known drift; live verification remains a release gate.
- Category hard deletion and bulk history consolidation are not exposed; `F-016` depends on crash-safe all-reference migration.
- Live taxonomy retirement and restore compatibility remain unverified; create, rename, reparent, budget-behavior update, and exact transaction-category replacement were verified on 2026-08-15.
- Receipt-memory evidence starts only with newly confirmed receipt operations; it does not backfill historical receipts. The three-receipt readiness threshold is a review heuristic, not proof that a new category is warranted.
- Receipt memory is not application-encrypted in the local single-user release; it relies on OS account/disk security plus `0700`/`0600` permissions. Hosted/multi-user storage requires encryption and tenant isolation.
- Suggested paying accounts are heuristic and may be low-confidence; the exact preview exposes the basis and requires user confirmation or correction.
