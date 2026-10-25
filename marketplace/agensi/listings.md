# Agensi listing copy

Prepared 2026-10-17. Recommended initial price: Free for all three MIT-licensed skills. The receipt skill was submitted as Free on 2026-10-17; the other two remain optional separate listings. Final submitted receipt fields are in receipt-submission.json. No paid service or account connection is included.

## Listing 1

Title: ZenMoney Receipt Categorization with MCP

Slug: categorize-zenmoney-receipts

Category: Finance & Accounting

Tags: zenmoney, receipts, personal-finance, mcp, expense-tracking

Short description: Match receipt images and PDFs to ZenMoney expenses, preview exact category splits, and verify approved changes through a local MCP connector.

Description:
Turn a receipt into a reviewable ZenMoney entry. The agent reads the receipt, checks for an existing expense, selects supported categories, and presents the exact account, date, amounts, and categories before applying an approved change. Matching first helps avoid duplicate expenses. Interrupted operations have a recovery inspection path.

Optional local receipt memory retains narrow approved purpose groups for later category review. Full-price evidence can be tracked separately from paid amounts when the connector exposes evidencePricing. The skill keeps loyalty tender distinct from discounts and reports incomplete evidence honestly.

Requires a separately installed zenmoney-receipts MCP server and your own ZenMoney connection. The agent host reads the image/PDF; no OCR engine or public hosted connector is included. This is expense organization, not investment or tax advice.

Example prompts:
- Categorize this receipt in ZenMoney; show the preview first.
- Match this grocery receipt to an existing expense.
- Record the paid total and retain complete pre-discount category evidence.

## Listing 2

Title: ZenMoney Category Review with MCP

Slug: review-zenmoney-categories

Category: Finance & Accounting

Tags: zenmoney, budgeting, categories, mcp, personal-finance

Short description: Review bounded spending and retained receipt evidence, suggest clearer categories, and preview explicitly requested taxonomy changes.

Description:
Understand whether your category structure reflects how you spend. The agent reviews a bounded period, separates currencies, checks for truncated results, and distinguishes transaction history from optional retained receipt evidence. Recommendations include concrete rules for future categorization.

The default workflow is read-only. Requested category changes use dedicated preview/apply tools. Category consolidation blocks unsupported budget migrations rather than performing a partial merge. Requires the separately configured zenmoney-receipts MCP server and your own ZenMoney account.

Example prompts:
- Review my last 90 days of categories without changing anything.
- Which recurring receipt groups justify clearer categories?
- Preview a rename for this category.

## Listing 3

Title: ZenMoney Spending and Savings Review with MCP

Slug: find-zenmoney-savings

Category: Finance & Accounting

Tags: zenmoney, spending-analysis, savings, mcp, personal-finance

Short description: Explore bounded ZenMoney expenses and identify practical spending reductions with source-backed, read-only analysis.

Description:
Review where spending goes and identify recurring charges, discretionary purchases, and useful follow-up checks. The skill reports its period and evidence coverage, keeps currencies separate, and avoids presenting incomplete history as a complete budget.

It never changes financial data or promises savings. Suggested reductions are based on observed expenses and your stated priorities. Requires the separately installed zenmoney-receipts MCP server and your own ZenMoney connection.

Example prompts:
- Where did my money go over the last three months?
- Which recurring expenses should I review?
- Suggest practical cuts without changing my transactions.

## Shared fields

Source: https://github.com/jetteim/zenmoney-receipts
License: MIT (included in each ZIP).
Compatibility: local Codex workflow exercised; other MCP-capable hosts are possible but not verified by this submission. Do not select every supported-agent checkbox solely because Agensi supports those agents.
Dependencies: Node.js 20.11+, npm, Git, ZenMoney account and private token, configured zenmoney-receipts MCP tools; image/PDF-capable host for receipts.
Support: repository issue tracker for sanitized bug reports. Never upload receipts, tokens, personal transactions or memory exports to public issues.

Creator bio draft: I build open-source tools that make personal-finance workflows easier to inspect and verify. zenmoney-receipts combines MCP tools with focused skills for receipts, category review, and spending insights.

Creator display name, account email, avatar, country, payout identity and any required tax information: supply your own values in the authenticated dashboard. These cannot be inferred from the repository.
