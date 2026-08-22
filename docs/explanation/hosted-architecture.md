# Hosted connector architecture and threat model

The hosted connector is a separate deployment mode for using ZenMoney from ChatGPT or another remote MCP client without keeping a laptop online. It exposes direct Streamable HTTP at `/mcp`; it does not use, install, supervise, or depend on a tunnel.

OpenAI requires a public HTTPS Streamable HTTP endpoint for a remotely connected plugin, accurate tool metadata, and working authentication discovery. Customer-specific data and write actions require OAuth 2.1; the resource server must publish protected-resource metadata and validate issuer, audience, expiration, and scopes for every access token. See OpenAI’s [MCP server guide](https://developers.openai.com/plugins/build/mcp-server), [authentication guide](https://developers.openai.com/plugins/build/auth), and [connection/testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## System context

```text
[User]
  ├─ receipt ─> [ChatGPT / Codex / MCP host]
  ├─ login/consent ─> [Identity provider]
  └─ ZenMoney consent ─> [ZenMoney OAuth]

[MCP host] ── HTTPS + OAuth access token ──> [Hosted zenmoney-receipts]
[Hosted zenmoney-receipts] ── per-user OAuth credential ──> [ZenMoney API]
[Hosted zenmoney-receipts] ── encrypted/private state ──> [Persistent disk]
```

The host still extracts receipt facts. Receipt images and PDFs are not uploaded to this service. The server receives only the structured facts used in the exact preview.

## Containers and components

```text
[Managed TLS / Render edge]
          |
          v
[Node hosted HTTP process]
  ├─ OAuth protected-resource metadata
  ├─ bearer introspection + tenant-bound MCP sessions
  ├─ Streamable HTTP transport
  ├─ bounded receipt/taxonomy/savings MCP tools
  ├─ ZenMoney OAuth link/refresh/revoke controller
  ├─ encrypted tenant credential store
  ├─ per-tenant receipt memory
  ├─ per-tenant crash-recovery journal
  └─ privacy-safe operational events
          |
          v
[Encrypted persistent disk + snapshots]
```

An optional PostgreSQL adapter stores encrypted ZenMoney OAuth envelopes and one-time OAuth states. The current receipt-memory, journal, and event stores remain filesystem-backed, so the initial hosted profile is deliberately one instance on a persistent disk. It must not be horizontally scaled. Moving every state boundary to a transactional database is the gate for multi-instance availability.

## Authentication sequence

1. The MCP client reads `/.well-known/oauth-protected-resource/mcp`. It learns the exact `/mcp` resource, authorization-server issuer, and required scope.
2. The external authorization server runs authorization code with S256 PKCE. It must echo the MCP `resource` parameter and mint the exact resource as the access-token audience.
3. The connector introspects every bearer credential. Inactive credentials, missing subjects, wrong issuer/audience, expired credentials, or insufficient scopes fail with a discovery-capable `WWW-Authenticate` challenge.
4. The introspected subject becomes the tenant identity. A session created by one subject cannot be reused by another subject even when the second request has an otherwise valid token.
5. The tenant separately calls `zenmoney_begin_oauth_link`. The connector creates a one-time state and S256 verifier, then ZenMoney redirects to `/oauth/zenmoney/callback` after consent.
6. Access and refresh credentials are encrypted with AES-256-GCM. Tenant and state filenames/database keys are HMAC-derived; raw subjects and OAuth states do not appear in storage keys.
7. Expired ZenMoney access credentials refresh once per tenant under the same key. Confirmed unlink attempts upstream revocation when configured, then removes only that tenant’s encrypted record.
8. A separate exact-previewed hosted-data deletion rechecks a digest of the tenant's bounded filesystem state, revokes/unlinks the credential, removes only that HMAC-namespaced tenant directory, and verifies its absence. It never deletes ZenMoney transactions or categories.

The external identity provider—not this repository—must support the OpenAI client-registration mode selected for the connection (CIMD, DCR, or a predefined client) and S256 PKCE. OpenAI documents CIMD as preferred where supported.

## Threat model

| Threat | Control | Residual risk / operating action |
| --- | --- | --- |
| Stolen or replayed MCP access credential | TLS, short expiry, per-request introspection, exact audience/scope, subject-bound session | Revoke at the identity provider; inspect privacy-safe auth failure rates outside financial payloads. |
| OAuth callback interception or CSRF | Random one-time state, ten-minute expiry, S256 PKCE, exact redirect URI | ZenMoney’s current PKCE behavior still requires owned-client staging verification. Do not publish until verified. |
| Cross-tenant access | HMAC namespaces, encrypted per-tenant credentials, subject-bound sessions, isolation/deletion tests | Initial filesystem profile is one process/instance. No horizontal scaling. |
| Incomplete tenant deletion | Separate destructive preview lists credential/state presence and file count, binds a complete tenant-state digest, rechecks it, then verifies namespace removal | If credential revocation succeeds but filesystem deletion fails, stop the session and complete operator cleanup; rehearse this path before publication. |
| Credential disclosure in logs/support | No raw error logging; allowlisted event schema; support bundle excludes credentials, paths, tenant IDs, transaction IDs, amounts, and text | Operators must not add request-body or authorization-header logging at the edge. |
| Prompt injection from receipts or ZenMoney text | Receipt/API content is untrusted data; server instructions and tools keep read/write sequencing separate | Host-model behavior still needs regression evaluation. Exact preview and confirmation remain mandatory. |
| Duplicate or partial financial writes after crash | Persistent operation ID/journal, one-way target fingerprints, recovery classification, optimistic concurrency, compensation | `manual-review` forbids automatic replay. Exact target IDs are revealed only for that review. |
| Data loss on redeploy | Paid persistent disk, fsync/rename writes, daily platform snapshots | A disk permits one instance and brief deploy downtime. Test restore quarterly. |
| Malicious or oversized request | 1 MiB JSON cap, bounded schemas/results, maximum 100 sessions, 30-minute idle expiry | Add edge rate limits/WAF rules before public discovery. |
| Browser-origin/DNS-rebinding request | `/mcp` rejects an `Origin` header outside the exact configured HTTPS allowlist; server-to-server requests without `Origin` continue | Add only origins observed and verified for the intended client; never use a wildcard. |
| API drift | Pinned backend, full read verification, live read-only release gate, opt-in synthetic writes only | ZenMoney’s public documentation is known to drift; owned-client and live write evidence remain external gates. |

## Provider and cost decision

The initial staging/private-public-beta target is one paid Render web service with a 1 GB persistent disk. Render supplies a public HTTPS hostname, health checks, Docker deployment, disk encryption at rest, and encrypted daily snapshots. Its documented tradeoff is decisive: a service with a disk cannot scale beyond one instance and deploys have a short outage. See Render’s [web-service documentation](https://render.com/docs/web-services) and [persistent-disk documentation](https://render.com/docs/disks).

The cost envelope is one continuously available paid web-service instance, one 1 GB disk, and an external OAuth identity provider; optional managed PostgreSQL adds its own instance/storage cost. Prices and plan names change, so the operator must confirm the current [Render pricing](https://render.com/pricing) and identity-provider pricing immediately before deployment and configure a billing alert. The committed `render.yaml` is a staging blueprint, not authorization to incur charges.

## Trust and data boundaries

- ZenMoney and MCP credentials never enter prompts, CLI arguments, repository files, tool results, operational events, or support bundles.
- Raw receipt/OCR, merchants, product names, brands, SKUs, and ZenMoney response bodies are not persisted.
- Encrypted ZenMoney OAuth envelopes are application-encrypted. Other per-tenant files rely on the platform’s encrypted disk plus HMAC tenant namespaces and private file permissions.
- The private persistent disk is a controlled processor boundary. The privacy policy must name the actual operator, region, retention, deletion contact, sub-processors, and incident contact before anyone else is invited.

## Deployment evolution

The single-instance profile is suitable for private staging and a small explicitly limited beta. Public general availability requires all of the following: owned ZenMoney OAuth client approval and live PKCE/refresh/revoke evidence; external identity-provider configuration; filled privacy/terms/support contacts; restore drill; rate-limit and incident runbooks; ChatGPT staging discovery; and either an accepted single-instance availability objective or migration of receipt memory, recovery journal, and event state to transactional multi-instance storage.
