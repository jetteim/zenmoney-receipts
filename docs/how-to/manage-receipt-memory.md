# Manage local receipt memory

Receipt memory is optional and disabled on a fresh installation. Enable it when you want new agent sessions to use sanitized evidence from previously confirmed receipts while reviewing category granularity.

## Enable it

Build the project, create a no-write preview, inspect it, then repeat with explicit confirmation:

```bash
npm run build
node dist/cli.js memory enable --retention-days 180
node dist/cli.js memory enable --retention-days 180 --confirm
node dist/cli.js memory status
```

The default retention is 180 days. Allowed values are 30–730 days. The store keeps at most 1,000 receipts in a file capped at 4 MiB.

Once enabled, attach a receipt and say only `Categorize this.` The confirmed financial preview also shows the exact local evidence that will be retained. Nothing is retained during matching or preview. The evidence write happens only after ZenMoney verifies the receipt operation.

Use narrow, reusable purposes. Good grocery examples are `Fresh fruit`, `Fresh vegetables`, `Herbs`, `Dairy`, or `Bakery`. `Produce` is still too broad, and the connector rejects `Produce`, `Groceries`, `Food`, `Other`, brands, SKUs, and raw receipt text as durable evidence labels.

After a narrow purpose appears in three distinct retained receipts for the same current category and ZenMoney instrument, the receipt result reports `reviewReadiness.ready: true`. The installed agent workflow then immediately performs a read-only category review. A recommendation does not create or change a category; any taxonomy mutation still needs its own exact preview and confirmation.

## Inspect retained evidence

```bash
node dist/cli.js memory status
node dist/cli.js memory search --query "fresh" --limit 25
node dist/cli.js memory search --category-id YOUR_CATEGORY_ID --month-from 2026-06 --month-to 2026-08
node dist/cli.js memory get evi_EXACT_RECORD_ID
```

All commands return JSON. Search is aggregate and bounded. Purpose labels are receipt-derived untrusted data, never agent instructions, and totals from different instrument IDs remain separate.

The MCP equivalents are `zenmoney_receipt_memory_status`, `zenmoney_receipt_memory_search`, and `zenmoney_receipt_memory_get`.

## Change retention or stop recording

Preview before confirming:

```bash
node dist/cli.js memory enable --retention-days 90
node dist/cli.js memory enable --retention-days 90 --confirm
node dist/cli.js memory disable
node dist/cli.js memory disable --confirm
```

Reducing retention shows the exact number of records that will expire and deletes them only during the confirmed apply. Disabling stops future recording but preserves retained evidence until it expires or you delete it.

## Delete evidence

Delete one record by exact ID:

```bash
node dist/cli.js memory delete evi_EXACT_RECORD_ID
node dist/cli.js memory delete evi_EXACT_RECORD_ID --confirm
```

Purge every local evidence record:

```bash
node dist/cli.js memory purge
node dist/cli.js memory purge --confirm
```

The first command in each pair is a no-write exact preview. The `--confirm` form creates and applies a fresh equivalent preview in one process. Purge preserves valid enablement/retention settings; when recovering a corrupt store it resets to disabled defaults. These commands never modify ZenMoney.

Before uninstalling, run the confirmed purge if you want all retained evidence removed. Removing the MCP registration or source checkout alone does not delete application data.

## Data location and privacy boundary

`memory status` prints the exact file location. Defaults are:

- macOS: `~/Library/Application Support/zenmoney-receipts/receipt-memory/receipt-memory.json`
- Linux: `$XDG_DATA_HOME/zenmoney-receipts/receipt-memory/receipt-memory.json`, or `~/.local/share/...`
- Windows: `%LOCALAPPDATA%\zenmoney-receipts\receipt-memory\receipt-memory.json`

Tests or managed deployments may set `ZENMONEY_RECEIPT_MEMORY_DIR` to an explicit directory before starting the process.

The directory is mode `0700` and the atomic state file is mode `0600` on POSIX systems. The file is not application-encrypted in this local single-user release; it relies on OS account and disk protection. It stores only approved purpose, current category ID, receipt month, item count, exact group subtotal, and ZenMoney instrument. It stores a one-way receipt key for idempotency, never the transaction ID itself. It never stores receipt images/PDFs, OCR, merchant or product names, brands, SKUs, credentials, or raw ZenMoney responses.

If `memory status` reports corrupt content or an oversized file, reads fail closed. Inspect the purge preview and confirm it to reset the local store; the financial receipt workflow continues and reports memory as unavailable rather than undoing a verified ZenMoney write. An unsafe shared/wrong-owner storage directory is not automatically chmodded or purged: move the store to a dedicated current-user `0700` directory first.
