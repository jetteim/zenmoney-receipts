# Architecture and security

## Local and direct-hosted design

```text
Receipt photo/PDF
       |
       v
Codex / Claude -- local stdio --+--> zenmoney-receipts MCP --> private backend --> ZenMoney API
                                |
ChatGPT -- HTTPS /mcp ----------+    (separately deployed hosted mode; no tunnel)

                           sanitized approved groups -- atomic local receipt memory
```

The host model handles the receipt bytes. The wrapper receives only receipt facts and IDs, starts the pinned ZenMoney backend as a private child process, and keeps synchronized data in memory. A local ZenMoney token comes from a process environment variable or macOS Keychain. Hosted credentials are encrypted per authenticated tenant. No credential is returned by an MCP tool.

## Exposed mutation

The wrapper enables the upstream backend's write tools internally but exposes bounded receipt and taxonomy mutation flows:

```json
{
  "id": "validated transaction id",
  "expectedChanged": 123,
  "patch": { "tag": ["validated existing category id"] }
}
```

- category-only replacement on one selected expense;
- exact reconciliation of selected existing expense amounts/categories, including connector-created split parts;
- creation of exact categorized expense parts for a receipt with no existing match.
- exact category creation with explicit income/expense/budget behavior;
- allowlisted category rename, one-level reparenting, behavior change, or restoration;
- category retirement by disabling all selection/budget flags while preserving history.
- exact category consolidation across transactions, reminders, and reminder markers, followed by source retirement.

The wrapper does not forward arbitrary patches. It exposes no arbitrary delete, transfer, account, merchant, or payee mutation. Consolidation is a dedicated complete-reference operation, not a bulk patch surface. Taxonomy updates are restricted to `title`, `parent`, `showIncome`, `showOutcome`, `budgetIncome`, `budgetOutcome`, and `required`. Existing-expense reconciliation preserves account, date, merchant, payee, and comment. Foreign-currency expenses with original-operation amounts and pending transactions are rejected for amount changes.

The pinned backend's generic create builder omits fields required by the live ZenMoney transaction schema. The wrapper therefore uses a private create-only `/v8/diff/` path with the complete transaction shape (`viewed`, bank-ID placeholders, and QR placeholder included), immediately synchronizes the child snapshot, and verifies the generated ID. This path is not exposed as a generic MCP tool.

For a no-match receipt preview, date and account IDs are optional inputs. An omitted date resolves to the MCP host's local calendar date. An omitted account is selected by a bounded deterministic ranker: explicit semantic hint, payee history, selected-category history, recent eligible-account use, then an alphabetical/ID fallback. The preview returns only inferred values in `suggestedFields`, including the basis and confidence. Suggestions never bypass the exact preview/confirmation gate and do not change existing transactions.

Before that call, the server:

1. synchronizes the in-memory snapshot;
2. verifies the transaction exists, is not deleted, and is an expense rather than a transfer;
3. verifies every requested category exists and is active;
4. binds the exact operation plan and ten-minute expiry to a process-local random preview token (the category-only flow uses an HMAC-signed token);
5. requires the MCP input `confirmed: true` after the user has seen the preview.

After the call, it synchronizes again and verifies each exact amount/category plus the receipt-total equality. Stale or altered previews fail closed. Repeated apply calls in the same process return the stored verified result instead of duplicating writes.

When receipt memory is enabled, the same financial preview also binds up to ten sanitized evidence groups. Each includes a narrow durable purpose, a category used by the proposed transaction, item count, and exact subtotal. Broad umbrella evidence (`Produce`, `Groceries`, `Food`, `Other`) is rejected. Only after financial verification does the service hash the exact transaction-ID set into a one-way idempotency key and atomically retain the approved groups. A memory failure is reported without undoing a verified ZenMoney operation.

Readiness groups active records by normalized purpose, current category ID, and instrument. Three distinct receipts trigger a read-only category review recommendation. Stored labels remain untrusted data; readiness never authorizes a category mutation.

Taxonomy previews additionally bind the category concurrency version, normalized title, exact parent ID, and exact allowlisted behavior patch. The apply path rechecks sibling-title uniqueness, active parent state, one-level depth, and active children before sending a write. ZenMoney's tag schema does not provide archive semantics, so retirement is intentionally reversible through an update and never presented as deletion.

Category consolidation first reads a bounded complete reference snapshot, then binds source/target versions plus transaction/reminder/marker fingerprints into the preview. Any source budget reference blocks apply because its safe mutation semantics are not established. Supported apply updates references, retires the source last, re-reads everything, and verifies zero source references.

For a failed multi-step operation, the wrapper deletes only connector-generated part IDs and restores only source writes that were positively acknowledged. Restoration uses the acknowledged post-write concurrency version; a later concurrent edit is never overwritten. Incomplete compensation locks the preview and requires manual inspection. A permission-restricted journal records minimal phases and one-way fingerprints so a restarted process can classify a started operation before any retry.

## Prompt-injection boundary

Receipt text, retained purpose labels, and ZenMoney merchant/payee/comment fields are untrusted. Server instructions and plugin skills tell hosts never to treat those fields as commands. Text projections strip control characters and cap lengths. Tool inputs reject query/fragment/control/markup characters as appropriate, lists and responses are bounded, and errors redact bearer/token-like values.

## Data and currency boundaries

- Receipt files are not persisted or sent to ZenMoney by this MCP server.
- ZenMoney data is cached only in process memory by the child backend.
- Optional local receipt memory is disabled by default. It stores no raw receipts/OCR, merchants, products, brands, SKUs, transaction IDs, credentials, or raw ZenMoney responses.
- Receipt memory defaults to 180-day retention, is limited to 1,000 receipt records and 4 MiB, and excludes expired data from reads. POSIX directory/file modes are `0700`/`0600`; writes use a fixed-root lock and fsync/rename atomic replacement.
- Settings, single-record deletion, and purge use exact in-process preview tokens plus revision/digest concurrency checks. Corruption and unsafe symlinks fail closed; a confirmed purge can recover corrupt state.
- Local receipt evidence is not application-encrypted and relies on OS account/disk protection. Hosted credentials are encrypted per tenant; hosted receipt evidence/journals/events require the configured encrypted persistent disk and HMAC-separated tenant directory.
- Account balances and unrelated raw API fields are omitted from wrapper responses.
- Category summaries group by `outcomeInstrument`; different instrument IDs are never summed.
- Retired categories are excluded from active receipt/category suggestion paths unless explicitly requested for taxonomy inspection.
- Receipt matching can compare both `outcome` and `opOutcome`, but a printed currency code is not automatically mapped to a ZenMoney instrument ID.
- Unapplied preview tokens are in memory and expire across restart. Started operations have a persistent minimal journal; recovery inspection is read-only and a stale token never becomes reusable.
- Operational events are bounded allowlisted support metadata only. They exclude credentials, financial values, labels, receipt text, tenant IDs, target IDs, paths, and raw errors.

## Remaining risks and blockers

- Local mode needs a user-supplied access token. Hosted link/refresh/revocation code exists but requires an owned ZenMoney OAuth client and live contract verification.
- ZenMoney's published documentation was last edited in 2023 and has a public drift report, so the opt-in synthetic live E2E should be rerun after backend upgrades.
- Live taxonomy create/update paths have sanitized evidence; retirement and restore still require fresh explicit authorization and cleanup to verify.
- Account recommendation is heuristic. Low-confidence fallbacks are deliberately visible in the preview and require the same explicit confirmation as identified values.
- Merchant-text matching is heuristic. Ambiguous matches require manual selection.
- A compromised host model or local user account can access financial data available to the MCP process. The preview gate reduces accidental writes but cannot make a compromised endpoint trustworthy.
- Narrow purpose/subtotal history can still reveal habits, location, or sensitive product classes. Retention, bounded inspection, per-record deletion, full purge, and default-off enablement reduce but do not eliminate that inference risk.
- Source budgets block category consolidation until safe mutation semantics are authoritative. The connector refuses partial migration.
- Recovery fingerprints can classify the known plan but cannot prove intent for an unrelated manual concurrent change; ambiguous states become manual review.
- The initial hosted profile is single-instance and still needs an operator, external OAuth authorization server, persistent encrypted disk, real policies/support contacts, staging evidence, and incident response.

## Direct hosted connector

The repository contains a separate direct Streamable HTTP resource server, OAuth protected-resource metadata and bearer validation, tenant-bound sessions, per-user ZenMoney authorization lifecycle, encrypted stores, Docker/Render artifacts, policy templates, and a publication checklist. It does not include or need a tunnel. No deployed service or ChatGPT connection is claimed until the external gates in `docs/project/STATUS.md` are completed. OpenAI's current documentation describes [building an MCP server](https://developers.openai.com/plugins/build/mcp-server), [OAuth for MCP](https://developers.openai.com/plugins/build/auth), and [connecting a deployed server to ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt).

See `docs/project/ARCHITECTURE.md` for the C4 views and `docs/project/ROADMAP.md` for the reliability backlog.
