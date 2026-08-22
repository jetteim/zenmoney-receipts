# Hosted configuration reference

The hosted process fails closed when a required setting is missing. Secret values belong only in the hosting secret manager.

| Setting | Required | Meaning |
| --- | --- | --- |
| `HOST` | No | Bind address; use `0.0.0.0` on Render. Defaults to `127.0.0.1`. |
| `PORT` | No | HTTP port supplied by the platform; defaults to `8080`. |
| `ZENMONEY_HOSTED_PUBLIC_ORIGIN` | Yes | Public HTTPS origin, no path/query/fragment. `/mcp` and callback paths are derived. |
| `ZENMONEY_HOSTED_ALLOWED_ORIGINS` | No | Comma-delimited additional HTTPS browser origins allowed to call `/mcp`. Requests without an `Origin` header are allowed; unexpected browser origins are rejected. The connector's own public origin is always allowed. |
| `ZENMONEY_HOSTED_DATA_DIR` | Yes | Private durable directory. Must be on the attached persistent disk. |
| `ZENMONEY_HOSTED_MASTER_KEY` | Yes, secret | Unpadded base64url encoding of exactly 32 random bytes for AES-256-GCM/HMAC. |
| `ZENMONEY_HOSTED_OAUTH_ISSUER` | Yes | Canonical external authorization-server issuer. |
| `ZENMONEY_HOSTED_OAUTH_INTROSPECTION_URL` | Yes | HTTPS access-token introspection endpoint. |
| `ZENMONEY_HOSTED_OAUTH_INTROSPECTION_CLIENT_ID` | Yes, secret-like | Resource-server introspection client ID. |
| `ZENMONEY_HOSTED_OAUTH_INTROSPECTION_CLIENT_SECRET` | Yes, secret | Resource-server introspection client secret. |
| `ZENMONEY_HOSTED_OAUTH_SCOPES` | No | Space-delimited required MCP scopes; defaults to `mcp:tools`. |
| `ZENMONEY_OAUTH_AUTHORIZATION_URL` | Yes | Current owned-client ZenMoney authorization endpoint. |
| `ZENMONEY_OAUTH_TOKEN_URL` | Yes | Current owned-client ZenMoney token/refresh endpoint. |
| `ZENMONEY_OAUTH_REVOCATION_URL` | Recommended | Current revocation endpoint. Without it, unlink deletes only local encrypted state. |
| `ZENMONEY_OAUTH_CLIENT_ID` | Yes | Owned ZenMoney OAuth client ID. |
| `ZENMONEY_OAUTH_CLIENT_SECRET` | Provider-dependent, secret | Owned client secret when the current contract requires it. |
| `ZENMONEY_OAUTH_SCOPES` | Provider-dependent | Space-delimited ZenMoney scopes confirmed during registration. |
| `DATABASE_URL` | Optional, secret | PostgreSQL connection for encrypted OAuth envelopes and one-time states. Does not replace the persistent disk for other state. |

Endpoints:

| Path | Authentication | Purpose |
| --- | --- | --- |
| `GET /healthz` | None | Bounded liveness only; proves neither downstream auth nor readiness. |
| `GET /.well-known/oauth-protected-resource/mcp` | None | MCP OAuth protected-resource metadata. |
| `POST/GET/DELETE /mcp` | Bearer | Stateful Streamable HTTP MCP. |
| `GET /oauth/zenmoney/callback` | One-time state/code | Completes separate ZenMoney linking. |

Limits are fixed in code: 1 MiB HTTP request body, 100 active sessions, 30-minute idle session expiry, 500 consolidation references, 200 recovery records retained for 30 days, and 500 privacy-safe operational events.
