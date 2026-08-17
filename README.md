# ZenMoney Receipts

Private, local-first receipt categorization for ZenMoney through MCP. ChatGPT, Codex, Claude Code, or another MCP host reads the receipt image/PDF; this server receives structured receipt facts, finds or creates the expense, previews the exact mutation, waits for confirmation, applies it, and verifies the result.

The source is shareable, but each current installation is private to its owner. Version 0.6.0 has no public GPT, hosted multi-user connector, or shared financial-data service; a separately secured hosted/public path is planned under roadmap item `F-014`.

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
- Suggest host-local today when the receipt date is unreadable and recommend a paying account from an explicit hint or bounded prior usage.
- Mark every inferred date/account field in the exact preview with its basis and confidence.
- Re-sync and verify every write; repeated applies are idempotent within the server process.
- Review category usage without combining different ZenMoney instrument IDs.
- Review category granularity and analyze monthly/category/payee evidence for realistic saving opportunities.
- Preview and confirm exact category creation, rename, one-level reparenting, behavior changes, restoration, or retirement.
- Optionally retain sanitized narrow receipt-purpose evidence for 180 days, inspect or purge it locally, and automatically review category granularity when a purpose recurs across three verified receipts.

The MCP exposes no generic update/delete tool. Category retirement disables selection while preserving history; it is not deletion or bulk transaction migration. Ambiguous matches and unsupported allocations fail closed. Receipt bytes stay with the host model and are neither uploaded nor stored by this server.

## Typical receipt prompt

Attach the receipt and send it. If the host requires text:

> Categorize this.

The server instructions and receipt skill automatically inspect, synchronize, match, choose existing-vs-new behavior, create one preview part per supported category, and stop only for genuine transaction/allocation ambiguity or final write confirmation. If the receipt date is unreadable, the preview suggests the MCP host's local current date. If no paying account was identified, it recommends one from a payment hint, matching payee/category history, or a deterministic fallback. Only those inferred fields appear in `suggestedFields`; reject the preview if either suggestion is wrong.

For a category review:

> Review my categories.

To implement a reviewed plan:

> Apply the category plan safely.

The assistant will show exact create/update/retirement previews and wait for confirmation. It cannot hard-delete a category or bulk-migrate historical transactions.

When local receipt memory is enabled, the confirmed receipt preview can retain only sanitized purpose groups, category IDs, month, item count, subtotal, and instrument. It rejects umbrella evidence such as `Produce`, `Groceries`, `Food`, or `Other`; use durable leaves such as `Fresh fruit`, `Fresh vegetables`, or `Herbs`. Raw receipts, OCR, merchants, products, brands, SKUs, transaction IDs, and credentials are never stored. After the same narrow purpose appears in three distinct verified receipts for one category/instrument, the assistant automatically runs a read-only category review. See [Manage local receipt memory](docs/how-to/manage-receipt-memory.md).

For saving suggestions:

> Help me save money.

## Project status

Version 0.6.0 adds opt-in, permission-restricted, retention/size-bounded receipt evidence memory and automatic read-only granularity review readiness to the private single-user baseline. Known operational limits—including process-local financial preview state, partially verified live taxonomy paths, and manual ZenMoney token lifecycle—are tracked in [project status](docs/project/STATUS.md) and the [roadmap](docs/project/ROADMAP.md).

The latest sanitized E2E evidence is in [docs/e2e-test-log-2026-08-15.md](docs/e2e-test-log-2026-08-15.md). Live write tests are opt-in and must never be run without explicit authorization.

## Documentation

- Tutorial: [getting started](docs/getting-started.md)
- How-to: [use with Codex](docs/how-to/use-with-codex.md), [manage receipt memory](docs/how-to/manage-receipt-memory.md), [install with an agent](docs/how-to/install-with-agent.md), [connect private ChatGPT](docs/how-to/private-chatgpt.md), [continue development](docs/how-to/develop.md)
- Reference: [CLI](docs/reference/cli.md), [MCP tools](docs/reference/mcp-tools.md)
- Explanation: [architecture and security](docs/architecture-and-security.md)
- Durable project context: [status](docs/project/STATUS.md), [roadmap](docs/project/ROADMAP.md), [decisions](docs/project/DECISIONS.md), [traceability](docs/project/TRACEABILITY.md)

## Safety

Never commit or paste a ZenMoney token, OpenAI runtime key, receipt, or financial export into an issue, prompt, command argument, or log. Before reporting a vulnerability, read [SECURITY.md](SECURITY.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).

This project is independent software, not an official ZenMoney product. It wraps the MIT-licensed [`@nonnname/zenmoney-mcp`](https://github.com/nonnname/zenmoney-mcp) backend and uses ZenMoney's documented `/v8/diff/` API.
