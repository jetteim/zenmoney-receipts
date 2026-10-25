# Connector requirements and setup

These skills require the separate open-source [zenmoney-receipts MCP server](https://github.com/jetteim/zenmoney-receipts). Installing skill instructions through a marketplace does not install that server, connect ZenMoney, or enable receipt memory.

Requirements: Node.js 20.11+, npm, Git, a ZenMoney account, a privately configured ZenMoney access token, and a host that can expose local MCP tools. Receipt image/PDF interpretation is performed by the host. The connector validates structured facts; it does not perform OCR.

For a local checkout:

```sh
git clone https://github.com/jetteim/zenmoney-receipts.git
cd zenmoney-receipts
npm ci
npm run check
```

Configure credentials privately. On macOS, run `./scripts/auth-macos.sh` in a trusted terminal and enter the token at its hidden prompt. Never paste credentials into agent chat or commit them. On other platforms, use a private process environment configured by the operator. Run `npm run doctor:live` for read-only verification.

Configure a local stdio MCP server named `zenmoney-receipts` in the host, with command `node` and arguments containing the absolute path to the checkout's `dist/index.js`. Host configuration formats differ; use the host's MCP settings. The repo's `node scripts/install.mjs --host codex` supports automated local Codex installation after reviewing `npm run setup:plan`.

Confirm `zenmoney_capabilities`, `zenmoney_connection_status`, and a read-only sync work before handling money. Confirm that receipt preview tools expose `evidencePricing` if full-price evidence is needed. Rebuild and restart an older server rather than dropping receipt items. Tools can have host-specific namespace prefixes; use the exposed tool inventory.

Receipt memory is optional, default-off, and separate from the skill package. Inspect its actual location and retention. Local mode stores minimal approved groups on the MCP machine; it never stores original files/OCR or syncs those groups to ZenMoney. Raw receipts remain subject to the host's own privacy policy; local connector storage does not mean the host/model is offline.

A public hosted ZenMoney connector is not supplied. Remote-only hosts need a separately operated hosted deployment. Agensi MCP distributes instructions and is not a substitute for the ZenMoney connector.

For an automatic receipt-triggered category review, use the packaged category-review reference if the companion skill is unavailable. Taxonomy and financial changes always retain their exact preview/confirmation boundaries.
