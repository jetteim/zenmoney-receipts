---
name: review-zenmoney-categories
description: Review bounded ZenMoney spending summaries to identify uncategorized expenses, overlapping or catch-all categories, inconsistent merchant treatment, and possible grouping improvements. Use when the user asks to audit, simplify, reorganize, or improve spending categories.
---

# Review ZenMoney Categories

## Workflow

1. Ask for a review period only if the user did not specify one; otherwise use the requested dates.
2. Call `zenmoney_connection_status`, `zenmoney_sync`, and `zenmoney_list_categories`.
3. Call `zenmoney_category_summary` for the period. If `possiblyTruncated` is true, split the date range into smaller periods before drawing conclusions.
4. Analyze each ZenMoney `outcomeInstrument` independently. Never sum or compare raw totals across different instrument IDs as if they were one currency.
5. Look for:
   - meaningful uncategorized spend;
   - broad catch-all groups masking distinct purposes;
   - parent and child categories used inconsistently;
   - near-duplicate category names or unclear boundaries;
   - recurring merchants assigned to different categories;
   - low-use categories that may not justify their own group.
6. Separate observations from recommendations. State the sample period, transaction count, truncation status, and limitations.
7. Recommend a small, prioritized grouping plan with examples and explicit decision rules for future receipts.

## Change boundary

This connector does not create, rename, archive, merge, or delete ZenMoney categories. Do not imply those changes were applied. If the user wants individual existing transactions corrected, use the receipt categorization preview-and-confirm workflow for each update.
