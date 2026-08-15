# ZenMoney Receipts

Private, local-first receipt categorization for ZenMoney through MCP. ChatGPT, Codex, Claude Code, or another MCP host reads the receipt image/PDF; this server receives structured receipt facts, finds or creates the expense, previews the exact mutation, waits for confirmation, applies it, and verifies the result.

The source is shareable, but each current installation is private to its owner. Version 0.4.0 has no public GPT, hosted multi-user connector, or shared financial-data service; a separately secured hosted/public path is planned under roadmap item `F-014`.

## Start here

Requirements: Node.js 20.11+, npm, Git, and a ZenMoney access token. macOS Keychain is the recommended credential store. ChatGPT additionally needs OpenAI developer mode, tunnel permissions, and the official `tunnel-client`.

```bash
git clone https://github.com/jetteim/zenmoney-receipts.git
cd zenmoney-receipts
npm run setup:plan
node scripts/install.mjs --host codex
./scripts/auth-macos.sh
npm run doctor:live
```

The installer uses the committed lockfile, runs all offline checks, adds an idempotent local MCP registration, and installs the proactive receipt/category/savings skills for new Codex sessions. It refuses to overwrite a same-named registration that points elsewhere. The auth helper accepts the credential only through a hidden terminal prompt.

If you prefer an agent to do this, clone the repository and say:

> Read AGENTS.md and install this project for Codex. Show the dry-run first, never expose credentials, pause only for my secure ZenMoney authentication, then run the read-only live doctor.

See the [getting-started tutorial](docs/getting-started.md), [everyday Codex usage guide](docs/how-to/use-with-codex.md), or [agent installation guide](docs/how-to/install-with-agent.md).

## Capabilities

- Turn one receipt into one exact expense transaction per supported category when no existing transaction matches.
- Match receipt facts to bounded, sanitized ZenMoney expenses when the bank/import already created them.
- Preview and apply a category-only correction.
- Correct an existing total and split it into exact categorized parts.
- Create categorized expenses when a receipt has no existing match.
- Re-sync and verify every write; repeated applies are idempotent within the server process.
- Review category usage without combining different ZenMoney instrument IDs.
- Review category granularity and analyze monthly/category/payee evidence for realistic saving opportunities.
- Preview and confirm exact category creation, rename, one-level reparenting, behavior changes, restoration, or retirement.

The MCP exposes no generic update/delete tool. Category retirement disables selection while preserving history; it is not deletion or bulk transaction migration. Ambiguous matches and unsupported allocations fail closed. Receipt bytes stay with the host model and are neither uploaded nor stored by this server.

## Typical receipt prompt

Attach the receipt and send it. If the host requires text:

> Categorize this.

The server instructions and receipt skill automatically inspect, synchronize, match, choose existing-vs-new behavior, create one preview part per supported category, and stop only for genuine ambiguity or final write confirmation.

For a category review:

> Review my categories.

To implement a reviewed plan:

> Apply the category plan safely.

The assistant will show exact create/update/retirement previews and wait for confirmation. It cannot hard-delete a category or bulk-migrate historical transactions.

Visible receipt line items can also support an optional, more-granular category suggestion. The assistant uses only receipts available in the current session; version 0.4.0 does not persist receipt artifacts or cross-session receipt evidence. Opt-in, inspectable local evidence memory is tracked as roadmap item `F-017`.

For saving suggestions:

> Help me save money.

## Project status

Version 0.4.0 is the private single-user baseline with proactive short-intent workflows, bounded receipt and taxonomy writes, locked dependencies, CI, repository validation, machine-readable diagnostics, secure credential handoff, preview/confirmation, rollback attempts, read-only spending insights, and live receipt E2E evidence. Known operational limits—including process-local preview state, untested live taxonomy writes, and manual ZenMoney token lifecycle—are tracked in [project status](docs/project/STATUS.md) and the [roadmap](docs/project/ROADMAP.md).

The latest sanitized E2E evidence is in [docs/e2e-test-log-2026-08-15.md](docs/e2e-test-log-2026-08-15.md). Live write tests are opt-in and must never be run without explicit authorization.

## Documentation

- Tutorial: [getting started](docs/getting-started.md)
- How-to: [use with Codex](docs/how-to/use-with-codex.md), [install with an agent](docs/how-to/install-with-agent.md), [connect private ChatGPT](docs/how-to/private-chatgpt.md), [continue development](docs/how-to/develop.md)
- Reference: [CLI](docs/reference/cli.md), [MCP tools](docs/reference/mcp-tools.md)
- Explanation: [architecture and security](docs/architecture-and-security.md)
- Durable project context: [status](docs/project/STATUS.md), [roadmap](docs/project/ROADMAP.md), [decisions](docs/project/DECISIONS.md), [traceability](docs/project/TRACEABILITY.md)

## Safety

Never commit or paste a ZenMoney token, OpenAI runtime key, receipt, or financial export into an issue, prompt, command argument, or log. Before reporting a vulnerability, read [SECURITY.md](SECURITY.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).

This project is independent software, not an official ZenMoney product. It wraps the MIT-licensed [`@nonnname/zenmoney-mcp`](https://github.com/nonnname/zenmoney-mcp) backend and uses ZenMoney's documented `/v8/diff/` API.
