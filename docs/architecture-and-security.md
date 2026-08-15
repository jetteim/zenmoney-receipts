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

The wrapper enables the upstream backend's write tools internally but exposes only one mutation:

```json
{
  "id": "validated transaction id",
  "expectedChanged": 123,
  "patch": { "tag": ["validated existing category id"] }
}
```

The wrapper does not forward arbitrary patches. It provides no create, delete, transfer, amount, account, merchant, payee, or category-structure mutation.

Before that call, the server:

1. synchronizes the in-memory snapshot;
2. verifies the transaction exists, is not deleted, and is an expense rather than a transfer;
3. verifies every requested category exists and is active;
4. binds the transaction ID, concurrency version, category IDs, and ten-minute expiry into an HMAC-signed preview token;
5. requires the MCP input `confirmed: true` after the user has seen the preview.

After the call, it synchronizes again and verifies the exact final category array. Stale or altered previews fail closed.

## Prompt-injection boundary

Receipt text and ZenMoney merchant/payee/comment fields are untrusted. Server instructions and plugin skills tell hosts never to treat those fields as commands. Text projections strip control characters and cap lengths. Tool inputs reject query/fragment/control characters in resource IDs, lists and responses are bounded, and errors redact bearer/token-like values.

## Data and currency boundaries

- Receipt files are not persisted or sent to ZenMoney by this MCP server.
- ZenMoney data is cached only in process memory by the child backend.
- Account balances and unrelated raw API fields are omitted from wrapper responses.
- Category summaries group by `outcomeInstrument`; different instrument IDs are never summed.
- Receipt matching can compare both `outcome` and `opOutcome`, but a printed currency code is not automatically mapped to a ZenMoney instrument ID.

## Remaining risks and blockers

- A valid ZenMoney token must be supplied by the user. The private connector does not yet automate refresh-token exchange.
- ZenMoney's published documentation was last edited in 2023 and has a public drift report, so live read-only validation is necessary before the first real write.
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
