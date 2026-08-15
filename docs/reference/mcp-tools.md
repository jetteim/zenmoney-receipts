# MCP tool reference

Run `node dist/cli.js schema` after a build for the authoritative machine-readable schemas and safety annotations.

## Read-only

| Tool | Purpose |
| --- | --- |
| `zenmoney_connection_status` | Report credential availability/source without connecting or exposing it. |
| `zenmoney_sync` | Refresh the in-memory ZenMoney snapshot. |
| `zenmoney_list_accounts` | Return bounded account metadata without balances. |
| `zenmoney_list_categories` | Return active categories and one-level parents. |
| `zenmoney_list_transactions` | Return a bounded sanitized projection. |
| `zenmoney_get_transaction` | Return one exact sanitized transaction. |
| `zenmoney_suggest_categories` | Ask ZenMoney for advisory category candidates. |
| `zenmoney_match_receipt` | Rank expense candidates from structured receipt facts. |
| `zenmoney_category_summary` | Summarize usage while keeping instrument IDs separate. |
| `zenmoney_spending_insights` | Produce bounded monthly/category/payee evidence for read-only saving suggestions. |

## Preview and apply pairs

| Preview | Apply | Scope |
| --- | --- | --- |
| `zenmoney_preview_receipt_category` | `zenmoney_apply_receipt_category` | Replace categories on one selected expense. |
| `zenmoney_preview_receipt_reconciliation` | `zenmoney_apply_receipt_reconciliation` | Correct/split one selected receipt expense. |
| `zenmoney_preview_new_receipt` | `zenmoney_apply_new_receipt` | Create categorized expenses for a missing receipt. |

Preview tools make no writes and return a short-lived token bound to the exact validated plan. Apply tools require `confirmed: true`, reject stale/conflicting plans, and re-sync and verify the result. Reconciliation is marked destructive because it can replace a source expense with multiple parts. No arbitrary mutation or delete tool is exposed.
