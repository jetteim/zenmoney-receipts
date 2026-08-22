# Deploy the direct hosted connector

Use this guide after the local stdio connector passes. It creates a separately operated HTTPS service; it does not configure a tunnel and your laptop does not need to stay online after deployment.

## Prerequisites

You need a paid Render account or an equivalent Docker host with a persistent encrypted disk, a public hostname, an OAuth 2.1 identity provider, and an owned ZenMoney OAuth application. Do not use a personal access credential as a shared hosted credential.

ZenMoney’s public API material is old and known to drift. Obtain the current authorization, token, optional revocation endpoints, redirect-URI rules, scopes, refresh behavior, and client credentials directly during application registration. The public support answer still points developers to the OAuth client-registration path, while the official repository has an open [API documentation drift report](https://github.com/zenmoney/ZenPlugins/issues/757). Treat live staging verification as authoritative.

Before spending money or handling another user’s data, replace every placeholder in `docs/policies/`, choose a region, record the data-retention choice, and read the hosted [architecture and threat model](../explanation/hosted-architecture.md).

## 1. Verify the image locally

```bash
npm ci
npm run check
docker build -t zenmoney-receipts:staging .
```

Do not start the hosted image with real credentials until all environment settings are in a trusted secret manager. Never put them in `.env`, shell history, a prompt, or `render.yaml`.

Generate the 32-byte application encryption key in a trusted terminal and copy it directly into the host’s secret UI:

```bash
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url") + "\n")'
```

The output is a secret. Do not save or paste it anywhere except the hosting secret manager. Losing it makes encrypted ZenMoney credentials unrecoverable; exposing it requires rotating every stored tenant credential.

## 2. Configure the identity provider

Create a resource/API whose exact identifier is `https://YOUR_HOST/mcp`. Configure authorization code with S256 PKCE, access-token introspection, the `mcp:tools` scope, and an access-token subject unique to one user. The token audience must be the exact resource URL.

Configure ChatGPT as CIMD, DCR, or a predefined public client according to the provider. OpenAI’s current requirements are in its [authentication guide](https://developers.openai.com/plugins/build/auth). Verify that the authorization server publishes S256 in its metadata and preserves the MCP `resource` parameter through authorization and token exchange.

## 3. Register the ZenMoney application

Register this exact redirect URI:

```text
https://YOUR_HOST/oauth/zenmoney/callback
```

Record the current authorization, token, revocation, and scope values. The connector always sends a one-time state and S256 code challenge. If current ZenMoney staging does not accept PKCE, stop: do not downgrade the hosted public flow without a reviewed compensating design.

## 4. Deploy the Render blueprint

Create a Render Blueprint from the repository’s `render.yaml`. Confirm that it creates a paid web service and 1 GB persistent disk mounted at `/app/data`. Set every `sync: false` value in Render’s secret/environment UI. `ZENMONEY_HOSTED_PUBLIC_ORIGIN` is the HTTPS origin only, with no path or trailing data.

Use [hosted configuration reference](../reference/hosted-configuration.md) as the exact checklist. Leave `DATABASE_URL` unset for the one-instance disk profile. If supplied, only encrypted OAuth envelopes/states move to PostgreSQL; the service still needs its persistent disk for receipt memory, journals, and bounded events.

Leave `ZENMONEY_HOSTED_ALLOWED_ORIGINS` empty for server-to-server clients unless staging shows a legitimate browser `Origin` header. If one is required, add only its exact HTTPS origin; never configure a wildcard.

Deploy and verify:

```bash
curl -fsS https://YOUR_HOST/healthz
curl -fsS https://YOUR_HOST/.well-known/oauth-protected-resource/mcp
```

The second response must name exactly `https://YOUR_HOST/mcp`, the intended authorization-server issuer, and `mcp:tools`. It must not reveal secrets.

## 5. Inspect before ChatGPT

Run MCP Inspector against `https://YOUR_HOST/mcp` and exercise authorization failure, valid authorization, tool discovery, empty results, malformed input, confirmation enforcement, and unlink. OpenAI recommends testing representative inputs, edges, schemas, annotations, and model-readable results with Inspector before installing in ChatGPT.

Do not run a real write test unless the current conversation/session contains explicit authorization and the exact synthetic create/cleanup plan. Read-only synchronization is the default live gate.

## 6. Connect a private ChatGPT staging instance

In ChatGPT, enable Developer mode if available for the account/workspace, open Plugins, add a connection, and enter `https://YOUR_HOST/mcp`. Review every discovered tool and complete both identity-provider authorization and the separate ZenMoney link. These UI steps follow OpenAI’s [connect and test guide](https://developers.openai.com/plugins/deploy/connect-chatgpt); availability can depend on workspace policy.

Test the three user outcomes:

- Attach a synthetic receipt and confirm the agent matches before creating a preview.
- Request a read-only 90-day category review and inspect retained narrow receipt evidence.
- Request savings suggestions over the previous three complete months and confirm instruments remain separate.

ChatGPT UI discovery is human evidence. A healthy HTTP endpoint or MCP Inspector does not prove the account connection is installed.

## 7. Production gate and rollback

Complete the checklist in `docs/project/HOSTED_PUBLICATION_CHECKLIST.md`. For rollback, remove the ChatGPT connection, disable the Render service, revoke the identity-provider client and ZenMoney application credentials, then retain or delete the disk only according to the published policy and user deletion obligations. Rotating `ZENMONEY_HOSTED_MASTER_KEY` requires a deliberate decrypt/re-encrypt migration; do not replace it in place.
