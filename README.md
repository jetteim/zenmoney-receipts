# ZenMoney Receipts

A local-first MCP server and OpenAI plugin package for matching receipt photos/PDFs to existing ZenMoney expenses, previewing category-only changes, and reviewing category usage.

Status: the private single-user path is implemented and tested. A valid ZenMoney access token and, for ChatGPT, OpenAI Secure MCP Tunnel access are still required. No live ZenMoney write has been performed by the automated test suite.

## What it does

- Lets ChatGPT, Codex, Claude Code, or another MCP host inspect bounded ZenMoney projections.
- Matches extracted receipt facts to existing expenses using date, total, account, merchant text, and original operation amount when available.
- Replaces only the selected transaction's category IDs after an exact preview and explicit confirmation.
- Re-syncs and verifies every write.
- Summarizes category usage without combining different ZenMoney instrument IDs.

Receipt images and PDFs are read by the host model. This MCP server receives only structured facts such as date, total, and merchant; it never uploads or stores the receipt file.

## Feasibility and constraints

| Area | Assessment |
| --- | --- |
| Codex and Claude Code | Enabled now through the local stdio MCP server. |
| Personal ChatGPT use | Enabled through OpenAI Secure MCP Tunnel; the Mac and tunnel client must remain online. |
| Public/multi-user ChatGPT plugin | Not implemented. It needs public HTTPS, MCP OAuth 2.1, per-user ZenMoney OAuth brokering, and encrypted token storage. |
| ZenMoney authorization | User-specific blocker. ZenMoney requires an access token; official client registration is reviewed, and its published OAuth example returns an expiring token. |
| Receipt line items | ZenMoney categories apply to a transaction, so mixed receipts cannot be split by this connector. |
| Category restructuring | Review recommendations are supported; create/rename/merge/archive/delete category operations are intentionally not exposed. |
| API confidence | ZenMoney's public wiki is useful but old, and an open issue reports documentation drift. Live read-only validation is required after setup. |

OpenAI documents Secure MCP Tunnel as an outbound-only way to connect a private stdio or HTTP MCP server to ChatGPT and Codex; tunnel connections are for private use/testing and cannot be submitted as public plugins. See [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) and [connect and test a plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt). ZenMoney documents its OAuth endpoints, application review, token response, entities, and `/v8/diff/` API in the [ZenMoney API wiki](https://github.com/zenmoney/ZenPlugins/wiki/ZenMoney-API); account for the reported [documentation drift](https://github.com/zenmoney/ZenPlugins/issues/757).

## 1. Build and verify

Requirements: macOS for Keychain storage, Node.js 20.11 or newer, and npm.

```bash
cd "/Users/maximlee/Library/CloudStorage/OneDrive-Personal/Pet projects/zenmoney-receipts"
npm install
npm run check
```

The check runs unit/contract tests, TypeScript validation, a production build, and a real stdio MCP smoke test. `npm audit` should report zero known vulnerabilities.

## 2. Authorize ZenMoney

This repository never includes a ZenMoney credential. Obtain one using one of these routes:

1. For an owned integration, apply for a ZenMoney OAuth client using the registration link in the official API wiki, then complete the documented authorization-code flow.
2. For a personal experiment, the ZenMoney wiki points to [Zerro.app's token page](https://zerro.app/token) as an already-registered service. This is a third party: review and trust it yourself before authorizing it.

The current connector accepts an access token but does not automate refresh-token exchange. The official example says access tokens expire after 86,400 seconds, so an officially issued short-lived token must be replaced when it expires. Automatic OAuth/refresh is part of the public-deployment work, not this private MVP.

Store the token in macOS Keychain without placing it in shell history. Run this command, then type the token at the secure prompt:

```bash
security add-generic-password -U -a "$(whoami)" -s zenmoney-receipts -w
```

The MCP process retrieves the item named `zenmoney-receipts` for the current macOS account. To use a session-only environment variable instead:

```bash
read -s ZENMONEY_ACCESS_TOKEN
export ZENMONEY_ACCESS_TOKEN
```

Do not put the token in `.mcp.json`, a committed `.env` file, a prompt, or an MCP command argument.

## 3A. Install in Codex

```bash
REPO_DIR="/Users/maximlee/Library/CloudStorage/OneDrive-Personal/Pet projects/zenmoney-receipts"
codex mcp add zenmoney-receipts -- node "$REPO_DIR/dist/index.js"
```

Restart Codex, then ask it to call `zenmoney_connection_status`. For a receipt:

> Categorize this receipt in ZenMoney. Match it first, show me the exact category change, and wait for my confirmation before applying it.

The repository also contains OpenAI plugin metadata and two skills under `skills/`; the direct MCP registration above is the shortest local installation path.

## 3B. Install in Claude Code

```bash
REPO_DIR="/Users/maximlee/Library/CloudStorage/OneDrive-Personal/Pet projects/zenmoney-receipts"
claude mcp add -s user zenmoney-receipts -- node "$REPO_DIR/dist/index.js"
```

Restart Claude Code and verify the connection with the status tool before attaching a receipt.

## 3C. Connect ChatGPT privately

OpenAI requires a `tunnel_id`, a runtime API key, the relevant Platform tunnel permissions, and ChatGPT developer-mode access. Create the tunnel in [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels), download the current `tunnel-client` there, and associate the target ChatGPT workspace.

Initialize a stdio profile, substituting your real tunnel ID:

```bash
read -s CONTROL_PLANE_API_KEY
export CONTROL_PLANE_API_KEY

tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile zenmoney-receipts \
  --tunnel-id tunnel_REPLACE_ME \
  --mcp-command 'node "/Users/maximlee/Library/CloudStorage/OneDrive-Personal/Pet projects/zenmoney-receipts/dist/index.js"'

tunnel-client doctor --profile zenmoney-receipts --explain
tunnel-client run --profile zenmoney-receipts
```

Keep the final command running. In ChatGPT:

1. Enable Developer mode in **Settings → Security and login**.
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select the plus button, and choose **Tunnel** as the connection.
3. Select the tunnel or enter its `tunnel_id`, create the connection, and review the nine discovered tools.
4. Start a new chat, enable the connection from the tools menu, attach a receipt, and use the prompt above.

Developer-mode and tunnel availability depend on account/workspace policy. A public deployment must follow OpenAI's [MCP OAuth 2.1 requirements](https://developers.openai.com/plugins/build/auth) instead of embedding a ZenMoney token or exposing this stdio process.

## Expected receipt workflow

1. The host extracts purchase date, final charged total, merchant, currency, and dominant purpose.
2. The MCP server syncs and ranks existing ZenMoney expenses.
3. If matching is ambiguous, the host asks you to choose; no write tool is available at this stage.
4. The server validates existing categories and returns before/after data plus a signed ten-minute preview token.
5. After your explicit confirmation, the server checks the transaction version, updates only `tag`, re-syncs, and verifies the final value.

For mixed receipts, choose a dominant category or explicitly request multiple existing tags. The connector does not split a transaction.

## Troubleshooting

- **Status says `configured: false`:** recreate the Keychain item for the same macOS account or export `ZENMONEY_ACCESS_TOKEN` in the process environment used by the MCP host.
- **ZenMoney request fails after previously working:** the access token may have expired or been revoked; replace it in Keychain.
- **No receipt match:** check the final charged total, date, account, and whether ZenMoney recorded the operation. Foreign-currency matching checks both account and original operation amounts when ZenMoney supplies both.
- **Preview expired or transaction changed:** create a fresh preview. Do not retry the old token.
- **ChatGPT cannot see the tunnel:** run `tunnel-client doctor`, keep `tunnel-client run` active, and verify workspace association plus Tunnels Read + Use permission.
- **Large category review is truncated:** review smaller date ranges and keep different instrument IDs separate.

See [docs/architecture-and-security.md](docs/architecture-and-security.md) for the trust boundaries and the path to a public connector.

## Development

```bash
npm test
npm run typecheck
npm run build
npm run smoke
npm audit
```

The implementation wraps the MIT-licensed [`@nonnname/zenmoney-mcp`](https://github.com/nonnname/zenmoney-mcp) backend and exposes a smaller receipt-specific contract with explicit MCP safety annotations.
