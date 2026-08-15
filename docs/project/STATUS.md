# Project status

Last updated: 2026-08-15

Current version: 0.3.0

Deployment target: private single-user local MCP; optional private ChatGPT Secure MCP Tunnel

## Current outcome

The connector supports the prioritized product workflows: create one expense per receipt-supported category, match/correct existing expenses, recommend more or less granular category organization, and produce bounded history evidence for saving suggestions. Writes use explicit preview/confirmation and post-write verification. The repository has reproducible installation, structured diagnostics, CI/security policy, durable roadmap/handoff context, and sanitized live E2E evidence.

## Verified baseline

- Offline unit/contract tests, typecheck, production bundle, stdio smoke, and repository validation: required on every change.
- Live read-only synchronization: passed on 2026-08-15 with 79 active categories and no financial records printed.
- Opt-in synthetic write E2E: passed 4/4 on the final v0.3.0 build on 2026-08-15; all exact generated IDs were deleted and cleanup verified.
- Live savings-insights read: passed over a non-truncated 90-day sample; only counts were logged.
- Codex local MCP registration: configured against this repository build on the maintainer machine.

Evidence: `docs/evidence/2026-08-15-v0.3.0-verification.md` and `docs/e2e-test-log-2026-08-15.md`. New release/live evidence belongs in `docs/evidence/` and must be sanitized.

## External setup state

- ZenMoney credential: configured on the maintainer machine; never stored in the repository.
- Private ChatGPT: official `tunnel-client` v0.0.11 is checksum-verified and installed on the maintainer machine. An organization-issued runtime key/tunnel ID, workspace association, tunnel doctor, and final ChatGPT UI connection remain external prerequisites. Do not mark ChatGPT installed until the tunnel doctor and UI tool discovery both pass.
- GitHub publishing: source is intended to be publicly cloneable; financial connections remain private per installation.

## Next actionable item

`F-005 / S-005A` — persist operation receipts/idempotency state so a process restart cannot erase evidence of a partially completed multi-step financial write. See `ROADMAP.md`.

## Known limits

- ZenMoney access-token acquisition/refresh is manual.
- Preview and apply-result idempotency state is process-local; restart invalidates previews and loses completed-result replay state.
- Compensating rollback is scoped and concurrency-safe but cannot guarantee recovery after process/host failure mid-operation.
- Private ChatGPT availability depends on the local machine, tunnel process, and OpenAI workspace policy.
- ZenMoney's public API documentation is old and has known drift; live verification remains a release gate.
