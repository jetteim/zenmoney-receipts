# How to use ZenMoney Receipts with Codex

The MCP registration is user-level. You can start a fresh Codex session from any working directory; you do not need to keep this repository open. Codex starts the local connector process when it calls a ZenMoney tool and stops it with the session.

Your Mac must be awake and online only while Codex is using ZenMoney. The connector is not a background cloud service.

## Start a session safely

For the first request in a new session, use:

> Use the `zenmoney-receipts` MCP. Check connection status, synchronize, and confirm the active category count. Do not make any changes and do not print transactions, balances, or credentials.

This confirms that the fresh session can access the Keychain credential and ZenMoney. You do not need to repeat it before every receipt when the same session remains healthy.

## Add a receipt: the primary workflow

Attach the photo or PDF in Codex. When using a local file rather than an attachment, give Codex its exact path and ensure the file is inside an accessible directory.

Normally, just send the attachment. If the host requires text, use:

> Categorize this.

The MCP server and installed receipt skill supply the full workflow automatically. The longer explicit prompt remains useful only when testing a new host that does not load server instructions or skills correctly.

The expected agent flow is:

```text
Inspect receipt
    ↓
Status + sync + active categories/accounts
    ↓
Match existing expenses
    ├─ one clear match → category correction or exact reconciliation preview
    ├─ no match        → new-receipt preview, one part per category
    └─ ambiguous       → ask; no preview and no write
    ↓
Show exact preview; no write yet
    ↓ explicit user confirmation
Apply the same preview
    ↓
Re-sync and report only a verified result
```

For a mixed receipt, line items or printed subtotals must support every category amount. If exact category subtotals are unavailable, ask Codex to use one dominant category or ask you for the allocation; it must not invent the split.

### Confirm the preview

After checking the account, amounts, categories, and total, say:

> I confirm this exact preview. Apply it and verify the result.

Confirmation authorizes only the shown preview. If anything should change, reject it and request a new preview instead. Preview tokens expire after ten minutes and are process-local; a new session must generate a new preview.

### Avoid duplicate expenses

Never ask Codex to skip matching. If a bank/imported transaction may already exist, the connector should match or ask before using the new-receipt path. “No clear match” is not the same as “no match.”

## Correct an existing receipt transaction

Use:

> Match this receipt to the existing ZenMoney expense. Its final total/category split appears wrong. Preserve its date, account, payee, merchant, and comment. Preview an exact reconciliation, stop for confirmation, then apply and verify only if I approve.

Foreign-currency operations carrying an original-operation amount are intentionally blocked from amount correction. A category-only update may still be possible.

## Review category granularity

Use a short request:

> Review my categories.

Without a specified period, the assistant reviews the previous 90 days. The connector analyzes category usage but does not create, rename, merge, archive, or delete categories. Recommendations are a plan, not an applied migration.

## Find saving opportunities

Use:

> Help me save money.

Without a specified period, the assistant analyzes the previous three complete calendar months. It should use `zenmoney_spending_insights`, split the period when the 500-transaction bound is reached, and distinguish observed totals/frequency from subjective suggestions. A repeated payee is only a candidate for review, not proof of a subscription or waste.

## Prompt-minimization rules

The assistant should silently perform all safe intermediate work. It should prompt only for:

- one focused clarification when a match is genuinely ambiguous;
- the payment account when it cannot be inferred safely;
- exact category amounts when receipt evidence does not support the split;
- confirmation of the final write preview.

It should not ask which tools to call, whether to synchronize, whether to list categories/accounts, what matching strategy to use, or which review period to use when the defaults apply.

## Useful read-only prompts

- “List my active ZenMoney categories and parent relationships. Do not make changes.”
- “Find likely ZenMoney matches for this receipt but do not preview or apply anything.”
- “Summarize category use for July 2026, keeping instruments separate.”
- “Show uncategorized expense count and representative examples for the last month; no changes.”
- “Call `zenmoney_spending_insights` for the last 90 days and report only coverage/truncation first.”

## What Codex may and may not do

| Action | Default behavior |
| --- | --- |
| Status, synchronization, bounded reads, matching, summaries | Read-only; no confirmation needed. |
| Preview category/reconciliation/new receipt | Validates and returns exact plan; no write. |
| Apply a preview | Requires your explicit confirmation for that preview. |
| Generic transaction update/delete | Not exposed. |
| Category create/rename/merge/archive/delete | Not exposed. |
| Live synthetic E2E | Development-only; requires explicit authorization in that conversation. |

Receipt text, merchant names, payees, comments, and API data are treated as untrusted content rather than instructions. The receipt file stays with Codex; the MCP receives only structured facts and does not store the file.

## Fresh and ephemeral sessions

Financial usage needs no remembered chat history: start a new session, attach the receipt, and use the primary prompt. Do not try to reuse an old preview after closing a session.

Development sessions use the repository as memory:

- “Read `AGENTS.md` and proceed” selects the first ready roadmap item.
- “Read `AGENTS.md`; add _idea_ to the roadmap, but do not implement it” records an idea with acceptance evidence and dependencies.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Connector is unavailable | Run `codex mcp get zenmoney-receipts --json`, then `npm run doctor` in the repository. |
| Credential appears missing in a restricted shell | Run `npm run doctor:live` with macOS Keychain access. Do not recreate the credential based only on a sandboxed check. |
| Token expired/revoked | Replace it using `./scripts/auth-macos.sh`, then rerun the live doctor. |
| Preview expired or session restarted | Generate a fresh preview and review it again. |
| Match is ambiguous | Choose a presented candidate or clarify; never force new-receipt creation. |
| Category/history result is truncated | Ask Codex to split the date range into smaller, non-overlapping periods. |
| Code was updated | Run `npm run check`, then start a new Codex session so it launches the rebuilt server. |

For machine-readable diagnostics and schemas, see the [CLI reference](../reference/cli.md) and [MCP tool reference](../reference/mcp-tools.md).
