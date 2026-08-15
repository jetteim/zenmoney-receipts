# ZenMoney Receipts

Private, local-first receipt categorization for ZenMoney through MCP. ChatGPT, Codex, Claude Code, or another MCP host reads the receipt image/PDF; this server receives structured receipt facts, finds or creates the expense, previews the exact mutation, waits for confirmation, applies it, and verifies the result.

The source is shareable, but each installation and ChatGPT connection remains private to its owner. There is no public GPT, hosted multi-user connector, or shared financial-data service.

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

The installer uses the committed lockfile, runs all offline checks, and adds an idempotent local MCP registration. It refuses to overwrite a same-named registration that points elsewhere. The auth helper accepts the credential only through a hidden terminal prompt.

If you prefer an agent to do this, clone the repository and say:

> Read AGENTS.md and install this project for Codex. Show the dry-run first, never expose credentials, pause only for my secure ZenMoney authentication, then run the read-only live doctor.

See the [getting-started tutorial](docs/getting-started.md), [agent installation guide](docs/how-to/install-with-agent.md), or [private ChatGPT guide](docs/how-to/private-chatgpt.md).

## Capabilities

- Turn one receipt into one exact expense transaction per supported category when no existing transaction matches.
- Match receipt facts to bounded, sanitized ZenMoney expenses when the bank/import already created them.
- Preview and apply a category-only correction.
- Correct an existing total and split it into exact categorized parts.
- Create categorized expenses when a receipt has no existing match.
- Re-sync and verify every write; repeated applies are idempotent within the server process.
- Review category usage without combining different ZenMoney instrument IDs.
- Review category granularity and analyze monthly/category/payee evidence for realistic saving opportunities, read-only.

The MCP exposes no generic update/delete tool and no category-structure mutation. Ambiguous matches and unsupported allocations fail closed. Receipt bytes stay with the host model and are neither uploaded nor stored by this server.

## Typical receipt prompt

> Categorize this receipt in ZenMoney. Match it first. If no match exists, preview a new expense. Show me the exact account, total, and category allocation, and wait for my confirmation before applying anything.

For a category review:

> Review the last 90 days of my ZenMoney spending categories. Keep currencies/instruments separate. Recommend a better grouping, but make no changes.

## Project status

Version 0.3.0 is the production-hardened private single-user baseline: locked dependencies, CI, repository validation, machine-readable diagnostics, secure credential handoff, bounded write tools, preview/confirmation, rollback attempts, read-only spending insights, and live read/write E2E evidence. Known operational limits—including process-local preview state, manual ZenMoney token lifecycle, and the need to keep a private ChatGPT tunnel running—are tracked in [project status](docs/project/STATUS.md) and the [roadmap](docs/project/ROADMAP.md).

The latest sanitized E2E evidence is in [docs/e2e-test-log-2026-08-15.md](docs/e2e-test-log-2026-08-15.md). Live write tests are opt-in and must never be run without explicit authorization.

## Documentation

- Tutorial: [getting started](docs/getting-started.md)
- How-to: [install with an agent](docs/how-to/install-with-agent.md), [connect private ChatGPT](docs/how-to/private-chatgpt.md), [continue development](docs/how-to/develop.md)
- Reference: [CLI](docs/reference/cli.md), [MCP tools](docs/reference/mcp-tools.md)
- Explanation: [architecture and security](docs/architecture-and-security.md)
- Durable project context: [status](docs/project/STATUS.md), [roadmap](docs/project/ROADMAP.md), [decisions](docs/project/DECISIONS.md), [traceability](docs/project/TRACEABILITY.md)

## Safety

Never commit or paste a ZenMoney token, OpenAI runtime key, receipt, or financial export into an issue, prompt, command argument, or log. Before reporting a vulnerability, read [SECURITY.md](SECURITY.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).

This project is independent software, not an official ZenMoney product. It wraps the MIT-licensed [`@nonnname/zenmoney-mcp`](https://github.com/nonnname/zenmoney-mcp) backend and uses ZenMoney's documented `/v8/diff/` API.
