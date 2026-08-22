# CLI reference

All automation commands return bounded output and never print credential values or financial records.

## `zenmoney-receipts doctor [--live]`

Returns a versioned JSON envelope with runtime, build, credential-source, Codex-registration, receipt-memory, crash-journal, and privacy-safe event checks. `--live` additionally synchronizes ZenMoney and reports only the active-category count.

- Exit `0`: no failed required check; warnings may remain for optional hosts.
- Exit `2`: one or more required checks failed.
- Exit `1`: unexpected execution error.

Run from source with `npm run doctor` or `npm run doctor:live`.

## `zenmoney-receipts schema`

Returns the live MCP tool names, descriptions, input schemas, and safety annotations without contacting ZenMoney.

## `zenmoney-receipts support-bundle`

Returns bounded runtime/configuration status, recent recovery metadata without targets, and up to 100 allowlisted operational events. It excludes credentials, raw errors, receipt text, financial values, category names, transaction IDs, tenant IDs, usernames, and local paths. Review the JSON before sharing it.

## `zenmoney-receipts memory ...`

All receipt-memory commands return a versioned JSON envelope and never contact or modify ZenMoney.

| Command | Result |
| --- | --- |
| `memory status` | Enablement, retention, counts, bounds, corruption state, privacy boundary, and exact data path. |
| `memory search [--query TEXT] [--category-id ID] [--month-from YYYY-MM] [--month-to YYYY-MM] [--limit N]` | Bounded aggregate purpose evidence; purpose labels are marked untrusted and instruments remain separate. |
| `memory get RECORD_ID` | One exact sanitized record. |
| `memory enable [--retention-days 30..730] [--confirm]` | Preview or apply enablement/retention. |
| `memory disable [--retention-days 30..730] [--confirm]` | Preview or apply disabled recording; existing evidence remains until expiry/deletion. |
| `memory delete RECORD_ID [--confirm]` | Preview or delete one exact local record. |
| `memory purge [--confirm]` | Preview or purge all local evidence; also recovers corrupt state. |

Mutations without `--confirm` make no change and return the exact preview. With `--confirm`, the CLI creates and applies a fresh equivalent short-lived preview in the same process. Settings changes can expire records when retention is reduced; delete and purge are destructive local operations. See [Manage local receipt memory](../how-to/manage-receipt-memory.md).

## `node scripts/install.mjs`

Options:

- `--host codex|claude|all|none` (default `codex`)
- `--dry-run` to make no changes
- `--json` for a single machine-readable stdout document

The real installer runs `npm ci`, `npm run check`, then adds only missing same-name registrations. For Codex it also installs the three workflow skills when missing. A conflicting MCP registration fails closed.

## `npm run eval:receipts`

Runs the deterministic synthetic receipt-facts contract pack and returns exact accuracy/safety metrics in JSON. It does not evaluate a particular OCR model and contains no user receipts.

## `npm run start:hosted`

Starts the direct hosted Streamable HTTP process from `dist/hosted-entry.js`. It fails closed unless every required hosted setting is present. See [hosted configuration](hosted-configuration.md). This command has no tunnel mode.
