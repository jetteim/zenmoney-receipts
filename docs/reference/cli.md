# CLI reference

All automation commands return bounded output and never print credential values or financial records.

## `zenmoney-receipts doctor [--live]`

Returns a versioned JSON envelope with runtime, build, credential-source, Codex-registration, and private-tunnel checks. `--live` additionally synchronizes ZenMoney and reports only the active-category count.

- Exit `0`: no failed required check; warnings may remain for optional hosts.
- Exit `2`: one or more required checks failed.
- Exit `1`: unexpected execution error.

Run from source with `npm run doctor` or `npm run doctor:live`.

## `zenmoney-receipts schema`

Returns the live MCP tool names, descriptions, input schemas, and safety annotations without contacting ZenMoney.

## `node scripts/install.mjs`

Options:

- `--host codex|claude|all|none` (default `codex`)
- `--dry-run` to make no changes
- `--json` for a single machine-readable stdout document

The real installer runs `npm ci`, `npm run check`, then adds only missing same-name registrations. For Codex it also installs the three workflow skills when missing. A conflicting MCP registration fails closed.

## `node scripts/private-chatgpt.mjs`

Commands: `plan`, `init`, `doctor`, and `run`. Options: `--profile`, `--tunnel-id`, and `--json`. Runtime keys are accepted only from the process environment, never arguments.

## `node scripts/install-tunnel-client.mjs`

Options: `--dry-run`, `--json`. On supported macOS/Linux/Windows architectures it downloads the latest stable official release, verifies SHA-256 from the same release, and installs a single executable under the current user's `.local/bin`.
