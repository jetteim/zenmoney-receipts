# Security policy

## Supported version

Only the latest commit on `main` is supported during the pre-1.0 private-use phase.

## Report a vulnerability

Do not open a public issue containing a credential, receipt, transaction, category name, account identifier, financial export, tenant/session identifier, or exploit details that expose user data. Contact the repository owner privately through their GitHub profile and provide a minimal synthetic reproduction.

If a credential may have been exposed, revoke/replace it first. Remove the affected ChatGPT connection, disable the hosted service or local MCP registration as applicable, and follow the provider incident process.

## Security boundaries

- Receipt bytes remain in the host and are not accepted by the MCP server.
- Local credentials come from macOS Keychain or the MCP process environment. Hosted ZenMoney credentials use per-tenant encrypted envelopes. Credentials are never returned by tools.
- ZenMoney live data stays in process memory; bounded projections omit balances and raw API objects. Optional receipt memory stores only explicitly previewed sanitized groups, never raw receipts/OCR or credentials, under the documented local retention/permission boundary.
- Mutations are semantic preview/apply pairs; there is no generic write/delete surface. Category consolidation blocks on source budgets and uses a durable operation journal.
- Hosted ChatGPT access is a separately deployed HTTPS OAuth resource server with tenant-bound sessions. The repository ships no tunnel mode and no hosted service by itself.

See [architecture and security](docs/architecture-and-security.md) for known limitations.
