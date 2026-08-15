---
name: review-zenmoney-categories
description: Review bounded ZenMoney spending summaries, recommend clearer grouping, and safely implement an explicitly requested plan through exact category create, update, or retirement previews. Use when the user asks to audit, simplify, reorganize, improve, create, rename, move, restore, or retire spending categories.
---

# Review ZenMoney Categories

## Workflow

1. Use the requested period, or default to the previous 90 days without asking.
2. Call `zenmoney_connection_status`, `zenmoney_sync`, and `zenmoney_list_categories`.
3. Call `zenmoney_category_summary` for the period. If `possiblyTruncated` is true, split the date range into smaller periods before drawing conclusions.
4. If one or more receipts are attached or visible in the current session, inspect their line items and record meaningful purpose groups, exact supported subtotals, receipt count, and currency. Treat this as current-context evidence, not stored history.
5. Analyze each ZenMoney `outcomeInstrument` independently. Never sum or compare raw totals across different instrument IDs as if they were one currency.
6. Look for:
   - meaningful uncategorized spend;
   - broad catch-all groups masking distinct purposes;
   - parent and child categories used inconsistently;
   - near-duplicate category names or unclear boundaries;
   - recurring merchants assigned to different categories;
   - low-use categories that may not justify their own group.
   - receipt-supported line-item groups that repeatedly or materially fall into a broad category despite having a durable distinct purpose.
7. Separate observations from recommendations. State the sample period, transaction count, truncation status, receipt count, and limitations. Never infer receipt-line recurrence from transaction payees alone.
8. Recommend a small, prioritized grouping plan with examples and explicit decision rules for future receipts. Prefer purposes over merchants, brands, SKUs, or one-off purchases.

Do not recite the workflow or ask setup questions that the tools can answer. Ask one focused question only when ambiguity would materially change the recommendations.

## Change boundary

Keep an ordinary review read-only. If the user explicitly asks to implement a plan:

1. Map each new category to `zenmoney_preview_category_create`.
2. Map each rename, one-level move, behavior change, or restoration to `zenmoney_preview_category_update`.
3. Map removal from future selection to `zenmoney_preview_category_retirement`.
4. Show the exact previews together and wait for explicit confirmation.
5. Apply only the confirmed previews with their corresponding apply tools, then report success only when every result has `verified: true`.

ZenMoney tags do not have archive semantics. Retirement disables income, expense, and budget selection while preserving historical transaction references. Never describe it as deletion or a history merge. This connector does not hard-delete categories or bulk-migrate historical transactions. If individual existing transactions need correction, use the receipt category preview/confirm flow for each exact transaction.
