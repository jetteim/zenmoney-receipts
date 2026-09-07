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
