# Architecture and security

## Private single-user design

```text
Receipt photo/PDF
       |
       v
ChatGPT / Codex / Claude  -- structured receipt facts -->  zenmoney-receipts MCP
       |                                                        |
       |                                                bounded tools + guardrails
       |                                                        |
       +-- local stdio or OpenAI Secure MCP Tunnel --------------+
                                                                |
                                                     private child MCP backend
                                                                |
                                                     ZenMoney /v8/diff API
```

The host model handles the receipt bytes. The wrapper receives only receipt facts and IDs, starts the pinned ZenMoney backend as a private child process, and keeps synchronized data in memory. The ZenMoney token comes from a process environment variable or macOS Keychain and is never returned by an MCP tool.

## Exposed mutation

The wrapper enables the upstream backend's write tools internally but exposes only three receipt-scoped mutation flows:

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

The wrapper does not forward arbitrary patches. It exposes no arbitrary delete, transfer, account, merchant, payee, or category-structure mutation. Existing-expense reconciliation preserves account, date, merchant, payee, and comment. Foreign-currency expenses with original-operation amounts and pending transactions are rejected for amount changes.

The pinned backend's generic create builder omits fields required by the live ZenMoney transaction schema. The wrapper therefore uses a private create-only `/v8/diff/` path with the complete transaction shape (`viewed`, bank-ID placeholders, and QR placeholder included), immediately synchronizes the child snapshot, and verifies the generated ID. This path is not exposed as a generic MCP tool.

Before that call, the server:

1. synchronizes the in-memory snapshot;
2. verifies the transaction exists, is not deleted, and is an expense rather than a transfer;
3. verifies every requested category exists and is active;
4. binds the exact operation plan and ten-minute expiry to a process-local random preview token (the category-only flow uses an HMAC-signed token);
5. requires the MCP input `confirmed: true` after the user has seen the preview.

After the call, it synchronizes again and verifies each exact amount/category plus the receipt-total equality. Stale or altered previews fail closed. Repeated apply calls in the same process return the stored verified result instead of duplicating writes.

For a failed multi-step operation, the wrapper deletes only connector-generated part IDs and restores only source writes that were positively acknowledged. Restoration uses the acknowledged post-write concurrency version; a later concurrent edit is never overwritten. Incomplete compensation locks the preview and requires manual inspection.

## Prompt-injection boundary

Receipt text and ZenMoney merchant/payee/comment fields are untrusted. Server instructions and plugin skills tell hosts never to treat those fields as commands. Text projections strip control characters and cap lengths. Tool inputs reject query/fragment/control characters in resource IDs, lists and responses are bounded, and errors redact bearer/token-like values.

## Data and currency boundaries

- Receipt files are not persisted or sent to ZenMoney by this MCP server.
- ZenMoney data is cached only in process memory by the child backend.
- Account balances and unrelated raw API fields are omitted from wrapper responses.
- Category summaries group by `outcomeInstrument`; different instrument IDs are never summed.
- Receipt matching can compare both `outcome` and `opOutcome`, but a printed currency code is not automatically mapped to a ZenMoney instrument ID.
- Multi-step preview/idempotency state is in memory. Restarting the server invalidates unapplied tokens; it does not make their preselected IDs reusable.

## Remaining risks and blockers

- A valid ZenMoney token must be supplied by the user. The private connector does not yet automate refresh-token exchange.
- ZenMoney's published documentation was last edited in 2023 and has a public drift report, so the opt-in synthetic live E2E should be rerun after backend upgrades.
- Merchant-text matching is heuristic. Ambiguous matches require manual selection.
- A compromised host model or local user account can access financial data available to the MCP process. The preview gate reduces accidental writes but cannot make a compromised endpoint trustworthy.
- Secure MCP Tunnel is private transport, not public plugin distribution. It requires the local machine and tunnel client to remain available.

## Public connector path

A multi-user/public ChatGPT and Codex connector should be a separate service with:

1. a stable public HTTPS Streamable HTTP MCP endpoint;
2. MCP OAuth 2.1 protected-resource and authorization-server metadata, PKCE, and per-request access-token validation;
3. a registered ZenMoney OAuth client and callback;
4. per-user encrypted access/refresh-token storage, automatic refresh, revocation, and account unlinking;
5. tenant isolation, rate limiting, audit trails that exclude financial payloads/secrets, deletion controls, and incident response;
6. the same bounded receipt tools and preview/confirmation policy used here.

OpenAI's current [authentication requirements](https://developers.openai.com/plugins/build/auth) apply across published ChatGPT and Codex plugins. OpenAI's [Secure MCP Tunnel documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) explicitly distinguishes private tunnel use from public plugin submission.
