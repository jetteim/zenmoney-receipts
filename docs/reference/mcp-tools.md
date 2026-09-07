# MCP tool reference

Run `node dist/cli.js schema` after a build for the authoritative machine-readable schemas and safety annotations.

## Read-only

| Tool | Purpose |
| --- | --- |
| `zenmoney_connection_status` | Report credential availability/source without connecting or exposing it. |
| `zenmoney_capabilities` | Read effective mode, connection configuration, memory availability and feature limits; never claims live verification or host skill discovery. |
| `zenmoney_preferences` | Inspect local-only structured preferences, catalog, effective values and storage state. |
| `zenmoney_preview_preferences` / `zenmoney_apply_preferences` | Exact confirmed enable/disable/set/delete/purge of local preferences; no financial writes. Absent in hosted mode. |
| `zenmoney_sync` | Refresh the in-memory ZenMoney snapshot. |
| `zenmoney_list_accounts` | Return bounded account metadata without balances. |
| `zenmoney_list_categories` | Return active categories and one-level parents; include retired categories only when requested. |
| `zenmoney_list_transactions` | Return a bounded sanitized projection. |
| `zenmoney_get_transaction` | Return one exact sanitized transaction. |
| `zenmoney_suggest_categories` | Ask ZenMoney for advisory category candidates. |
| `zenmoney_match_receipt` | Rank expense candidates from structured receipt facts; omitted date uses a marked host-local-today search suggestion. |
| `zenmoney_category_summary` | Summarize usage while keeping instrument IDs separate. |
| `zenmoney_spending_insights` | Produce bounded monthly/category/payee evidence for read-only saving suggestions. |
| `zenmoney_receipt_memory_status` | Report local evidence enablement, bounds, corruption state, and exact path. |
| `zenmoney_receipt_memory_search` | Aggregate bounded retained purpose evidence; labels are untrusted and instruments remain separate. |
| `zenmoney_receipt_memory_get` | Return one exact sanitized local evidence record. |
| `zenmoney_list_operation_recovery` | List bounded journal metadata without target IDs or financial values. |
| `zenmoney_inspect_operation_recovery` | Re-sync and classify one interrupted operation; exact target IDs appear only for manual review. |

## Preview and apply pairs

| Preview | Apply | Scope |
| --- | --- | --- |
| `zenmoney_preview_receipt_category` | `zenmoney_apply_receipt_category` | Replace categories on one selected expense. |
| `zenmoney_preview_receipt_reconciliation` | `zenmoney_apply_receipt_reconciliation` | Correct/split one selected receipt expense. |
| `zenmoney_preview_new_receipt` | `zenmoney_apply_new_receipt` | Create categorized expenses for a missing receipt; `date` and `accountId` are optional preview inputs. |
| `zenmoney_preview_category_create` | `zenmoney_apply_category_create` | Create one exact top-level or child category. |
| `zenmoney_preview_category_update` | `zenmoney_apply_category_update` | Rename, reparent, restore, or change allowlisted income/expense/budget behavior. |
| `zenmoney_preview_category_retirement` | `zenmoney_apply_category_retirement` | Disable a leaf category while preserving its historical references. |
| `zenmoney_preview_category_consolidation` | `zenmoney_apply_category_consolidation` | Migrate all supported references from one leaf category and retire it. Source budgets block apply. |
| `zenmoney_preview_receipt_memory_settings` | `zenmoney_apply_receipt_memory_settings` | Enable/disable local evidence or change retention; reducing retention can expire records. |
| `zenmoney_preview_receipt_memory_delete` | `zenmoney_apply_receipt_memory_delete` | Delete one exact local evidence record; never changes ZenMoney. |
| `zenmoney_preview_receipt_memory_purge` | `zenmoney_apply_receipt_memory_purge` | Purge all local evidence or reset corrupt state; never changes ZenMoney. |

Preview tools make no writes and return a short-lived token bound to the exact validated plan. Apply tools require `confirmed: true`, reject stale/conflicting plans, and re-sync and verify the result. Reconciliation and taxonomy update/retirement are marked destructive because they can replace values the user relies on. No arbitrary mutation or delete tool is exposed.

When `zenmoney_preview_new_receipt` receives no date, it suggests the MCP host's local calendar date. When it receives no `accountId`, it ranks active instrument-bearing accounts using `accountHint`, bounded payee/category history, recent use, then a deterministic fallback. The selected date/account remain visible in the exact preview, and only inferred values appear in `suggestedFields` with a basis, confidence, and reason. Confirmation binds those values like every other preview field.

Every receipt preview accepts optional `evidenceGroups`. Each group contains a narrow durable `purpose`, current `categoryId`, item count, and exact supported subtotal. The group category must occur on a proposed receipt transaction, all group subtotals must fit within the receipt total, and umbrella purposes such as `Produce`, `Groceries`, `Food`, and `Other` are rejected. When local memory is enabled, these exact groups are retained only after the financial apply verifies. The result always includes `receiptMemory.reviewReadiness`; three distinct retained receipts for the same normalized purpose/category/instrument make it ready for an immediate read-only category review.

ZenMoney tags have no archive field. Retirement sets `showIncome`, `showOutcome`, `budgetIncome`, and `budgetOutcome` to `false`; it neither deletes the tag nor changes existing transaction tags. Category creation and updates enforce ZenMoney's maximum one parent level and fail closed if the complete taxonomy exceeds the 500-record safety bound.

Consolidation reads complete bounded transaction, reminder, reminder-marker, and budget references. If a source budget exists or bounds are exceeded, the preview returns no apply token. Otherwise the apply is journaled, rechecks exact fingerprints, migrates references, retires the source last, and verifies the full result. If a write result becomes uncertain, use operation recovery before retrying.

## Hosted-only authorization tools

These appear only in direct hosted mode:

| Tool | Purpose |
| --- | --- |
| `zenmoney_oauth_status` | Report whether the authenticated tenant has an encrypted ZenMoney link. |
| `zenmoney_begin_oauth_link` | Return a short-lived one-time S256-PKCE authorization URL. |
| `zenmoney_preview_oauth_unlink` | Preview removal of the current tenant's exact link. |
| `zenmoney_apply_oauth_unlink` | Revoke when configured, then delete the exact encrypted tenant credential. |
| `zenmoney_preview_hosted_data_deletion` | Preview permanent removal of the current tenant's link plus all hosted connector state, with exact state presence/file count. |
| `zenmoney_apply_hosted_data_deletion` | After exact confirmation and concurrency recheck, revoke/unlink and delete only that tenant's receipt memory, recovery journal, and events. It never deletes ZenMoney financial data. |

MCP client authentication is separate from ZenMoney linking. See the [hosted configuration reference](hosted-configuration.md).
