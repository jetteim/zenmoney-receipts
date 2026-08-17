# How to install with an agent

Use this when you want a fresh Codex or Claude session to install the clone safely.

## Prompt the agent

From the repository root, say:

> Read AGENTS.md and docs/getting-started.md. Install this connector for Codex. Start with the JSON dry-run. Do not expose or ask me to paste credentials into chat. When authentication is needed, tell me to run the secure local helper. Finish with the offline suite and the read-only live doctor; show sanitized evidence.

Replace “Codex” with “Claude Code” when appropriate.

## What the agent should execute

```bash
npm run setup:plan
node scripts/install.mjs --host codex --json
```

If authentication is missing, the agent should pause while you run this yourself in a trusted terminal:

```bash
./scripts/auth-macos.sh
```

Then the agent can run:

```bash
npm run doctor:live
```

For Codex, setup also installs the receipt, category-review, and savings workflow skills through Codex's system skill installer. Start a new Codex session afterward so short intents and receipt attachments load the proactive workflows.

After pulling a newer connector version that changes those workflows, refresh only the recognized ZenMoney skill copies:

```bash
npm run skills:install -- --refresh
```

The secure prompt is intentionally the one human step. Do not send a token in chat, a command argument, an issue, or an agent tool call.

## Roll back host registration

```bash
codex mcp remove zenmoney-receipts
```

For Claude Code, use `claude mcp remove -s user zenmoney-receipts`. This does not remove source files or Keychain credentials.

Before uninstalling, inspect and confirm `node dist/cli.js memory purge` if the user wants all retained receipt evidence removed. Host unregistration and deleting the checkout do not remove application data.

To remove the macOS Keychain item separately:

```bash
security delete-generic-password -a "$(id -un)" -s zenmoney-receipts
```
