# How to connect private ChatGPT

This route keeps the MCP server on your machine and uses OpenAI Secure MCP Tunnel's outbound HTTPS connection. It is for your private use and developer testing, not public connector distribution. The machine and tunnel process must remain online while ChatGPT uses it.

## Prerequisites

- The local connector passes `npm run doctor:live`.
- Your OpenAI organization can create tunnels and issue a runtime API key with the required tunnel permissions.
- The target ChatGPT workspace has developer mode and is associated with the tunnel.

Open [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels), create the private tunnel, associate the intended workspace, and copy its non-secret `tunnel_id`. Keep the runtime key secret.

## Install the official client

Inspect the local effect first:

```bash
node scripts/install-tunnel-client.mjs --dry-run --json
```

Then run:

```bash
node scripts/install-tunnel-client.mjs
```

The installer downloads the latest stable release from the official [`openai/tunnel-client`](https://github.com/openai/tunnel-client/releases/latest) repository, verifies the selected archive against the release checksum file, and places the executable in `~/.local/bin`. You may instead use the download supplied in Platform tunnel settings.

Ensure `~/.local/bin` is on `PATH`, then run `npm run chatgpt:plan`.

## Initialize the profile

In a trusted terminal, place the tunnel runtime key in the environment without writing it to history. Then initialize with the tunnel ID:

```bash
node scripts/private-chatgpt.mjs init \
  --profile zenmoney-receipts \
  --tunnel-id tunnel_REPLACE_ME

node scripts/private-chatgpt.mjs doctor --profile zenmoney-receipts
node scripts/private-chatgpt.mjs run --profile zenmoney-receipts
```

Keep the last process running.

## Add it in ChatGPT

1. Enable developer mode in ChatGPT settings.
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins), add a developer-mode app, and choose **Tunnel**.
3. Select the associated tunnel or enter its `tunnel_id`.
4. Review the 16 discovered tools before creating the connection.
5. Open a new chat, enable the connection, and start with the read-only status/category prompt from the tutorial.

The browser/UI step cannot be completed or verified by this repository. Availability depends on OpenAI account and workspace policy. ChatGPT does not inherit a Codex MCP configuration.

## Stop or remove access

Stop the running client to make the connector unavailable. Remove the ChatGPT connection and tunnel/workspace association in their respective UIs when no longer needed. Follow the official client documentation for deleting its local profile; do not recursively remove configuration directories.

See OpenAI's [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) for the current permission and UI flow.
