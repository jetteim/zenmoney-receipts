# Self-awareness contracts

These additive contracts explain the connector's decisions and limits. They do not authorize writes or replace the host's responsibility to obtain consent. See the [behavior architecture](../explanation/behavior-architecture.md) for source ownership.

## Decision provenance

Receipt match, category suggestion, and receipt preview results include `provenance.schemaVersion: 1`. Each decision identifies a field, its origin (`caller`, `server-rule`, or `zenmoney`), and a stable rule/basis. Existing confidence and candidate-reason fields remain available.

Supplied categories, allocations, and evidence groups remain caller choices even after contract validation. Omitted date/account defaults are server decisions; upstream category suggestions remain ZenMoney candidates. The host must explain its own interpretation separately. `receiptContentVerifiedByServer: false` is deliberate: the server never inspects the original receipt, and provenance does not prove OCR accuracy, human consent, or use of a saved preference.

## Effective capabilities

`zenmoney_capabilities` is a local read, including in hosted mode: it reads tenant connection metadata and receipt-memory status without synchronizing with ZenMoney. It reports mode, transport, implemented workflows, write prerequisites, unsupported actions, evidence locality and availability. A configured credential is not live verification. Disabled recording can coexist with readable retained evidence. Failed/corrupt memory is unavailable, not an empty history. Host model and loaded skills remain unknown.

## Evidence coverage

Memory search `coverage` counts stored, active, expired, matched and returned distinct receipts. It describes the requested period and observed receipt months; purpose counts must not be summed to infer receipt count. Retention is based on when evidence was recorded, not the receipt month. Reads exclude expired evidence without modifying the store.

Category/spending summaries report examined, included and excluded transactions, observed months and source bounds. Spending results also expose per-instrument display counts/limits. Months without evidence are not asserted to have zero spending. `completeShoppingHistory` is always false; these sources cannot prove that all purchases were captured. Observed month lists are capped at 120 with their own truncation flag.

## Explicit local preferences

`zenmoney_preferences` inspects the catalog, saved values, enabled state, revision, exact path and effective values. The default is disabled with no file; disabled values remain inspectable but `effective` is empty. These tools exist only in local mode. Hosted mode reports unsupported and never opens the operator's preference store.

| Key | Values | Meaning |
| --- | --- | --- |
| `foodGrouping` | `food-type`, `intended-consumer` | Group food by its type or intended consumer when receipt evidence supports that choice. |
| `categoryGranularity` | `existing-only`, `suggest-narrower` | Suppress or allow unsolicited narrower-category suggestions. |
| `candidateNotes` | `ask`, `never-suggest` | Allow an optional note offer or suppress unsolicited offers; neither value auto-writes comments. |

`zenmoney_preview_preferences` takes `change` with one operation: `enable`, `disable`, `purge`, `set` (key/value), or `delete` (key). Enable through a confirmed preview before setting a value. Every preview shows exact before/after and location; `zenmoney_apply_preferences` requires its token and explicit `confirmed: true`. Tokens expire after ten minutes and do not survive restart. Editing a choice means setting that key again; deleting removes one key. Disable preserves saved values; purge clears all values and disables preferences. Receipt-memory purge and preference purge are independent, and neither changes ZenMoney comments or financial records.

Storage defaults to the OS application-data `zenmoney-receipts/preferences/preferences.json` directory, with `ZENMONEY_PREFERENCES_DIR` as an operator override. Repository-contained paths are rejected, including canonical paths through aliases. The store is limited to 4 KiB, uses current-user private permissions on POSIX, an exclusive lock, atomic fsync/rename, exact pre-write digest/revision checks and post-write verification. It is not application-encrypted. Unknown keys/values, free text, unsafe permissions/symlinks, corrupt/oversized state and stale previews fail closed. A failed apply token is not retried: inspect state and create a fresh preview. A leftover lock after a crash requires operator inspection/removal while the server is stopped; corrupt storage requires operator repair outside the repository, not a blind automatic reset.

Preferences advise host interpretation only. Current user instructions and financial safety take precedence. The host must actually inspect and use an effective value before attributing a decision to it; chat corrections are never saved implicitly. No arbitrary text, receipt content, merchants, amounts, category/transaction IDs or credentials are accepted by this store.
