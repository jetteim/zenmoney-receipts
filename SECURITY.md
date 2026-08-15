# Security policy

## Supported version

Only the latest commit on `main` is supported during the pre-1.0 private-use phase.

## Report a vulnerability

Do not open a public issue containing a credential, receipt, transaction, category name, account identifier, financial export, tunnel ID tied to a private deployment, or exploit details that expose user data. Contact the repository owner privately through their GitHub profile and provide a minimal synthetic reproduction.

If a credential may have been exposed, revoke/replace it first. Remove the affected ChatGPT tunnel/workspace association and stop the local tunnel process when transport exposure is possible.

## Security boundaries

- Receipt bytes remain in the host and are not accepted by the MCP server.
- Credentials come from macOS Keychain or the MCP process environment and are never returned by tools.
- Live data stays in process memory; bounded projections omit balances and raw API objects.
- Mutations are receipt-scoped preview/apply pairs; there is no generic write/delete surface.
- Private ChatGPT access is outbound through OpenAI Secure MCP Tunnel and is not a public service.

See [architecture and security](docs/architecture-and-security.md) for known limitations.
