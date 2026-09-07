# Self-awareness verification — 2026-09-07

Target: local connector source and build. No live financial writes authorized or performed. This file contains engineering verification only.

## F-021 decision provenance

- `npm run check`: passed, 73 tests passed and one opt-in hosted process test skipped; typecheck/build, stdio smoke, synthetic extraction contract evaluation, repository validation passed.
- `npm run doctor:live`: passed outside the filesystem/network sandbox; OS credential presence and read-only synchronization verified. No financial records retained here. The sandboxed startup doctor could not access the OS credential.
- Detailed temporary outputs: `/tmp/zenmoney-f021-check.log`, `/tmp/zenmoney-self-awareness-live-doctor.log` (machine-local diagnostics, not repository artifacts).
- Changed outputs: receipt `provenance`, existing `suggestedFields` and match reasons preserved. No new telemetry metric/log/trace names.
- Rollback: revert the F-021 commit and rebuild/restart MCP; no financial state migration.
