# Credential process-context investigation — F-032

Target: local stdio connector credential discovery and optional trusted-terminal Codex CLI launch. Date: 2026-10-19. No financial writes, credential replacement, permission-policy changes or hook disabling occurred.

## Observations

- MCP connection status responded, so the MCP server was running; its credential source was missing.
- The user supplied a status-only terminal doctor result with successful Keychain discovery and live read-only synchronization. This is user-provided evidence, distinct from agent-run verification.
- Agent-side account lookup failed with `uv_os_get_passwd` while USER/LOGNAME were available. A direct, private fallback Keychain probe returned only failure status (exit 44), without printing a credential. That establishes a process-context difference, not the underlying OS policy responsible for it.
- User hooks were inspected without running their commands. Their PostToolUse secret scanner explains feedback on secret-like tool output. The script's HOME constants are path values; no username/environment mutation or Keychain handling was found. No causal evidence ties the hook to the account/Keychain failures.
- The existing Codex MCP registration is enabled stdio. A non-secret process-local env_vars override was parsed successfully by the installed CLI. Official MCP documentation supports forwarding named environment variables.

## Change and verification

- Native account lookup now falls back to validated USER/LOGNAME; an unusable account does not trigger arbitrary searches. Keychain reads have a 15-second timeout and keep stdout/error details private.
- Connection status and doctor expose finite diagnostic labels. The live doctor does not attempt upstream verification when local credential access fails and does not suggest token replacement as a universal fix.
- `npm run codex` builds and starts Codex from the trusted Terminal, passing the credential only in child environment. Only the variable name appears in the process-local MCP config override; no permanent registration or secret config is written.
- Focused tests passed: 11 account, Keychain failure, privacy, launcher and child-failure cases.
- Full offline `npm run check` passed with 105 tests and one opt-in hosted test skipped; build, CLI/MCP/backend smoke, receipt fixtures, repository and skill checks passed. Output: `/tmp/zenmoney-f032-check.log`.
- Agent-run read-only doctor output: `/tmp/zenmoney-f032-doctor.log`. It remains blocked by `keychain-unavailable`; live API verification from this process has not succeeded. Running the launcher here refuses to proceed rather than asking for a token or leaking an error.
- Recorded investigation began 2026-10-19T19:34Z; final check timestamps are available in the local output files. No metric/log/trace series was added; the diagnostic signals are `auth.zenmoney`, `live.zenmoney-readonly`, and `credentialDiagnostic`.

## Rollback and remaining verification

Rollback: revert only F-032 discovery/CLI/launcher/tests/docs changes; stop the optional launched Codex session to end environment forwarding. Other uncommitted feature work must be preserved. The Keychain item and permanent Codex configuration were not modified.

At the original investigation cutoff, the trusted-terminal launcher had synthetic child-process coverage and configuration parsing verification; a real launched Codex MCP connection remained unverified. That historical boundary is distinct from the follow-up below. A credential valid in Terminal should never be copied into chat to repair an agent context.

## Follow-up — 2026-10-25

A separately launched conversation verified MCP connection status with credential source `environment` and a successful live read-only synchronization. Resuming the same conversation while another client held it reported a conversation ownership conflict; a fork in an independent CLI process allowed the handoff. This verifies the environment-forwarding path, not the underlying reason the original process could not access Keychain. Hooks and permanent credential configuration were not changed.

The publication recheck passed 105 offline tests (one opt-in hosted test skipped) and an outside-sandbox read-only live doctor. See [commands, output paths, diagnostic names and rollback](2026-10-25-prepush-verification.md). No receipt content, personal identifiers or financial summaries are included in this evidence.
