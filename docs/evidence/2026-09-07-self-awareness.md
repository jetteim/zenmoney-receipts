# Self-awareness verification — 2026-09-07

## F-023 evidence coverage

- `npm run check`: passed, 79 tests passed; read-only expiry, distinct counts, filtered/empty/truncated coverage and month bounds verified. `npm run doctor:live`: passed after the coverage changes; no live writes.
- Output: `/tmp/zenmoney-f023-check.log` and `/tmp/zenmoney-self-awareness-live-doctor.log`; no new metric/log/trace names. Rollback: revert F-023, rebuild/restart; no stored-data migration.

## F-022 effective capabilities

- `npm run check`: passed, including local/hosted/unconfigured/store-failure capability fixtures and the real in-memory MCP tool call. No provider calls are made by this capability.
- Output: `/tmp/zenmoney-f022-check.log`; no new metric/log/trace names. Rollback: revert F-022, rebuild and restart; no data migration.

Target: local connector source and build. No live financial writes authorized or performed. This file contains engineering verification only.

## F-021 decision provenance

- `npm run check`: passed, 73 tests passed and one opt-in hosted process test skipped; typecheck/build, stdio smoke, synthetic extraction contract evaluation, repository validation passed.
- `npm run doctor:live`: passed outside the filesystem/network sandbox; OS credential presence and read-only synchronization verified. No financial records retained here. The sandboxed startup doctor could not access the OS credential.
- Detailed temporary outputs: `/tmp/zenmoney-f021-check.log`, `/tmp/zenmoney-self-awareness-live-doctor.log` (machine-local diagnostics, not repository artifacts).
- Changed outputs: receipt `provenance`, existing `suggestedFields` and match reasons preserved. No new telemetry metric/log/trace names.
- Rollback: revert the F-021 commit and rebuild/restart MCP; no financial state migration.
