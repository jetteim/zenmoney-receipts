# MCP tool reference

Run `node dist/cli.js schema` after a build for the authoritative machine-readable schemas and safety annotations.

## Read-only

| Tool | Purpose |
| --- | --- |
| `zenmoney_connection_status` | Report credential availability/source without connecting or exposing it. |
| `zenmoney_sync` | Refresh the in-memory ZenMoney snapshot. |
| `zenmoney_list_accounts` | Return bounded account metadata without balances. |
| `zenmoney_list_categories` | Return active categories and one-level parents; include retired categories only when requested. |
| `zenmoney_list_transactions` | Return a bounded sanitized projection. |
| `zenmoney_get_transaction` | Return one exact sanitized transaction. |
| `zenmoney_suggest_categories` | Ask ZenMoney for advisory category candidates. |
| `zenmoney_match_receipt` | Rank expense candidates from structured receipt facts; omitted date uses a marked host-local-today search suggestion. |
| `zenmoney_category_summary` | Summarize usage while keeping instrument IDs separate. |
| `zenmoney_spending_insights` | Produce bounded monthly/category/payee evidence for read-only saving suggestions. |

## Preview and apply pairs

| Preview | Apply | Scope |
| --- | --- | --- |
| `zenmoney_preview_receipt_category` | `zenmoney_apply_receipt_category` | Replace categories on one selected expense. |
| `zenmoney_preview_receipt_reconciliation` | `zenmoney_apply_receipt_reconciliation` | Correct/split one selected receipt expense. |
| `zenmoney_preview_new_receipt` | `zenmoney_apply_new_receipt` | Create categorized expenses for a missing receipt; `date` and `accountId` are optional preview inputs. |
| `zenmoney_preview_category_create` | `zenmoney_apply_category_create` | Create one exact top-level or child category. |
| `zenmoney_preview_category_update` | `zenmoney_apply_category_update` | Rename, reparent, restore, or change allowlisted income/expense/budget behavior. |
| `zenmoney_preview_category_retirement` | `zenmoney_apply_category_retirement` | Disable a leaf category while preserving its historical references. |

Preview tools make no writes and return a short-lived token bound to the exact validated plan. Apply tools require `confirmed: true`, reject stale/conflicting plans, and re-sync and verify the result. Reconciliation and taxonomy update/retirement are marked destructive because they can replace values the user relies on. No arbitrary mutation or delete tool is exposed.

When `zenmoney_preview_new_receipt` receives no date, it suggests the MCP host's local calendar date. When it receives no `accountId`, it ranks active instrument-bearing accounts using `accountHint`, bounded payee/category history, recent use, then a deterministic fallback. The selected date/account remain visible in the exact preview, and only inferred values appear in `suggestedFields` with a basis, confidence, and reason. Confirmation binds those values like every other preview field.

ZenMoney tags have no archive field. Retirement sets `showIncome`, `showOutcome`, `budgetIncome`, and `budgetOutcome` to `false`; it neither deletes the tag nor changes existing transaction tags. Category creation and updates enforce ZenMoney's maximum one parent level and fail closed if the complete taxonomy exceeds the 500-record safety bound. Bulk category consolidation/history migration is not exposed in version 0.5.0.
