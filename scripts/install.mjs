#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = resolve(repoRoot, "dist/index.js");

function parseArgs(argv) {
  const result = { host: "codex", dryRun: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--json") result.json = true;
    else if (arg === "--host") result.host = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!["codex", "claude", "all", "none"].includes(result.host)) {
    throw new Error("--host must be codex, claude, all, or none");
  }
  return result;
}

function run(command, args, json, capture = false) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "ignore"] : json ? ["ignore", "ignore", "inherit"] : "inherit"
  })?.trim();
}

function optional(command, args) {
  try {
    return { ok: true, output: run(command, args, true, true) };
  } catch {
    return { ok: false, output: "" };
  }
}

function ensureCodex(json, actions) {
  const existing = optional("codex", ["mcp", "get", "zenmoney-receipts", "--json"]);
  if (existing.ok) {
    const registration = JSON.parse(existing.output);
    const configuredPath = registration?.transport?.args?.at(-1);
    if (registration?.transport?.command === "node" && configuredPath === serverPath) {
      actions.push({ id: "host.codex", status: "unchanged", detail: "Existing registration already points to this build." });
      return;
    }
    throw new Error("Refusing to overwrite a different Codex registration named zenmoney-receipts. Inspect it with `codex mcp get zenmoney-receipts --json`.");
  }
  run("codex", ["mcp", "add", "zenmoney-receipts", "--", "node", serverPath], json);
  actions.push({ id: "host.codex", status: "installed", detail: "Registered local stdio MCP server." });
}

function ensureClaude(json, actions) {
  const existing = optional("claude", ["mcp", "get", "zenmoney-receipts"]);
  if (existing.ok) {
    if (existing.output.includes(serverPath)) {
      actions.push({ id: "host.claude", status: "unchanged", detail: "Existing registration already points to this build." });
      return;
    }
    throw new Error("Refusing to overwrite a different Claude registration named zenmoney-receipts. Inspect it with `claude mcp get zenmoney-receipts`.");
  }
  run("claude", ["mcp", "add", "-s", "user", "zenmoney-receipts", "--", "node", serverPath], json);
  actions.push({ id: "host.claude", status: "installed", detail: "Registered local stdio MCP server." });
}

function plan(host) {
  const hosts = host === "all" ? ["codex", "claude"] : host === "none" ? [] : [host];
  return {
    schemaVersion: "1",
    command: "setup",
    ok: true,
    dryRun: true,
    repoRoot,
    effects: [
      { id: "dependencies", action: "Run npm ci using the committed lockfile." },
      { id: "verification", action: "Run the full offline test, build, smoke, and repository validation suite." },
      ...hosts.map((name) => ({ id: `host.${name}`, action: `Add an idempotent user-level ${name} MCP registration only if the name is unused.` })),
      ...(hosts.includes("codex") ? [{ id: "host.codex-skills", action: "Install the three ZenMoney workflow skills with Codex's system skill installer when missing." }] : [])
    ],
    credentialAction: process.platform === "darwin"
      ? "If auth is missing, run ./scripts/auth-macos.sh in a trusted interactive terminal."
      : "Provide the ZenMoney credential only in the MCP process environment; never pass it as a command argument.",
    rollback: hosts.map((name) => `${name} mcp remove zenmoney-receipts`)
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.dryRun) {
    const value = plan(options.host);
    if (options.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    else process.stdout.write(`${value.effects.map((effect) => `- ${effect.action}`).join("\n")}\n`);
    return;
  }

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (!(major > 20 || (major === 20 && minor >= 11))) throw new Error("Node.js 20.11 or newer is required.");

  const actions = [];
  run("npm", ["ci"], options.json);
  actions.push({ id: "dependencies", status: "installed" });
  run("npm", ["run", "check"], options.json);
  actions.push({ id: "verification", status: "passed" });
  if (options.host === "codex" || options.host === "all") ensureCodex(options.json, actions);
  if (options.host === "codex" || options.host === "all") {
    run(resolve(repoRoot, "scripts/install-skills.sh"), [], options.json);
    actions.push({ id: "host.codex-skills", status: "installed-or-unchanged", detail: "Receipt, category-review, and savings workflows are available to new Codex sessions." });
  }
  if (options.host === "claude" || options.host === "all") ensureClaude(options.json, actions);

  const result = {
    schemaVersion: "1",
    command: "setup",
    ok: true,
    dryRun: false,
    actions,
    next: "Run `npm run doctor:live`; this performs a read-only synchronization and prints no financial records."
  };
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `Setup complete. ${result.next}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Setup failed";
  process.stdout.write(`${JSON.stringify({ schemaVersion: "1", command: "setup", ok: false, error: message })}\n`);
  process.exitCode = 1;
});
