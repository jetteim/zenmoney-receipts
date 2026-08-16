# Live taxonomy operation verification — 2026-08-15

## Scope and privacy

This evidence records a user-confirmed live `F-015` category-organization operation against the private ZenMoney account. It contains no category names, category IDs, transaction IDs, dates, amounts, account IDs, balances, credentials, receipt content, or raw ZenMoney responses.

- Target: verify bounded category creation and updates plus exact transaction-category replacement through the production connector.
- Execution surface: connected MCP preview/apply tools; there was no reusable shell write command.
- Completion timestamp: `2026-08-15T15:09:27Z`.

## Confirmation and writes

The connector synchronized successfully before the operation. Exact previews were shown in two dependency-ordered stages and the user explicitly confirmed each stage before any corresponding apply call.

- Stage one: two category creates and four allowlisted category updates.
- Stage two: two allowlisted category updates and 26 exact transaction-category replacements.
- Every apply result returned `verified: true`; no operation reported a failure or stale concurrency version.
- No retirement, deletion, history consolidation, generic patch, or unpreviewed write was attempted.

## Independent read-back

A final synchronization completed without error. Read-only category and transaction queries then verified:

- all eight affected taxonomy records matched the requested one-level hierarchy and budget behavior;
- all 26 selected transactions referenced the intended leaf category;
- zero transactions matching the confirmed recurring set remained directly assigned to the source parent category;
- transactions outside the exact confirmed set were not changed by this operation.

## Rollback path and limits

Rollback was not requested or run. A rollback would require new exact previews and confirmation for the reverse transaction-category replacements and reverse category updates. Newly created categories cannot be hard-deleted through this connector; after reversing dependent child relationships they can be separately retired, preserving historical references.

This operation verifies the exercised live create, rename, reparent, budget-behavior, and transaction-category paths. It does not verify category retirement, restore, crash recovery, generic history consolidation, or unrelated ZenMoney semantics.
