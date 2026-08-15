# Tutorial: first read-only ZenMoney session

This tutorial takes a new macOS user from a clone to a verified Codex connection without changing any financial data.

## 1. Clone and inspect the plan

```bash
git clone https://github.com/jetteim/zenmoney-receipts.git
cd zenmoney-receipts
npm run setup:plan
```

The JSON plan names every local effect and rollback command. Node.js 20.11 or newer is required.

## 2. Build, test, and register Codex

```bash
node scripts/install.mjs --host codex
```

The installer runs `npm ci`, the offline test/build/smoke suite, and then registers `dist/index.js`. Existing matching registrations are left alone; conflicting ones are not overwritten.

For Claude Code instead, use `--host claude`. Use `--host all` only when both hosts are installed.

## 3. Authorize ZenMoney securely

Obtain a personal access token. For an owned integration, use ZenMoney's application/OAuth process. For a personal experiment, the ZenMoney API wiki links to [Zerro's token page](https://zerro.app/token); it is a third party, so decide whether you trust it before authorization.

On macOS, run:

```bash
./scripts/auth-macos.sh
```

Paste the value at the hidden terminal prompt. The helper stores it in the current user's Keychain under service `zenmoney-receipts`. It does not put it in shell history or repository files.

On other platforms, inject the credential only into the MCP server process environment. Do not use a committed `.env` file or command argument.

## 4. Run the read-only live check

```bash
npm run doctor:live
```

A passing result confirms credential access, synchronization, and an active-category count. It prints no category names, transactions, balances, or credential values and performs no writes.

Restart the MCP host. Ask it:

> Call `zenmoney_connection_status`, synchronize ZenMoney, and list my categories. Do not make any changes.

Once that passes, attach a receipt and use the prompt from the README. Every mutation must first return an exact preview and wait for your explicit confirmation.

Continue with [Use ZenMoney Receipts with Codex](how-to/use-with-codex.md) for receipt creation, category reviews, saving suggestions, ephemeral sessions, and troubleshooting.

## 5. Optional private ChatGPT connection

Continue with [Connect private ChatGPT](how-to/private-chatgpt.md). ChatGPT does not read the local Codex MCP registration; it needs its own private tunnel connection.
