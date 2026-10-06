# Local evidence correction verification

Target: F-028 / VS-05 / C-17, local receipt-memory store and CLI. No ZenMoney writes were made by the correction workflow. Personal labels, amounts, record IDs, source receipts and repair payloads are intentionally excluded from this engineering record.

## Commands and results

- `npm run setup:plan`: passed the no-write setup plan.
- `npm run doctor -- --output json`: build, runtime, registration and storage checks passed; shell credential access failed. This does not establish live authentication from the shell. The connected MCP supplied the authorized evidence reads.
- `npm run check`: passed on 2026-09-29. 91 tests passed, one opt-in test skipped; typecheck/build, synthetic correction CLI checks, 39-tool MCP smoke, synthetic receipt contract evaluation and repository verification passed. Output: `/tmp/zenmoney-f028-check.log` (offline engineering output only).
- `node dist/cli.js memory correct`: no-write preview from bounded stdin, binding the current revision and exact before/after plan digest.
- `node dist/cli.js memory correct --confirm --plan-digest DIGEST`: authorized local correction completed; success collected at 2026-09-30 13:37 UTC. Returned `applied: true`, `verified: true`, and `rollbackCopyRemoved: true`.
- Post-apply MCP exact-record reads matched every proposed record. Rebuilt CLI search showed canonical labels, explicit unknown/known amount bases, basis-separated subtotals and a false comparability flag for mixed bases. Record count, amounts, item counts, category assignments, receipt keys, timestamps, instruments and retention were preserved. State permissions remained `0600`; no rollback copy remained.
- `git diff --check`: passed. Documentation-only completion updates were checked with `npm run verify:repo`.

## Pre-publication recheck — 2026-10-06

The user authorized committing and pushing F-028. `npm run check` passed against the current tree, including F-029 integration: 91 application tests passed, one opt-in hosted test skipped, build/typecheck, synthetic correction CLI tests, 39-tool MCP smoke, receipt contract fixtures, six skill-evaluator tests and skill packaging verification. Output: `/tmp/zenmoney-f028-precommit-check.log`. The local CLI reference was updated to distinguish digest-bound correction from the existing mutation commands; repository and whitespace checks passed. Startup doctor again could not access a credential in the sandboxed shell; no new auth or provider-read implementation is part of this commit.

## Failure coverage and rollback

Synthetic tests cover no-write preview, plan mismatch, stale revision, replay rejection, strict unknown-field rejection, unsupported enum values, duplicate record IDs, conflicting purpose labels, broad-label rejection, stdin size bounds, malformed JSON without payload echo, private storage, interrupted-operation rollback markers, and restoration after a simulated post-write failure.

The apply path uses the existing exclusive local-store lock and atomic fsync/rename writer. A private temporary rollback copy sits beside the managed file during apply. It is removed after verified success or verified restoration; an uncertain interrupted operation leaves it for inspection. Never overwrite a concurrent external state or discard an unreviewed recovery copy.

Code rollback is a source revert and rebuild. Existing optional finite annotations are compatible with schema v1, but old running processes omit the new aggregate context. Restart a long-running MCP host to load that context. New CLI invocations already use the rebuilt implementation. This verification does not claim an MCP host restart, hosted deployment, financial recategorization, or reconstruction of unavailable receipt detail.

Observability: structured result fields `applied`, `verified`, `correctedRecordCount`, `revision`, `rollbackCopyRemoved`; no new metrics, logs or traces containing personal evidence.
