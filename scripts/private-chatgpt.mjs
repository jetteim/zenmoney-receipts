#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = resolve(repoRoot, "dist/index.js");

function parse(argv) {
  const options = { command: argv[0] ?? "plan", profile: "zenmoney-receipts", tunnelId: undefined, json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--profile") options.profile = argv[++index];
    else if (arg === "--tunnel-id") options.tunnelId = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(options.profile)) throw new Error("Invalid profile name.");
  if (options.tunnelId !== undefined && !/^tunnel_[A-Za-z0-9_-]{4,200}$/.test(options.tunnelId)) throw new Error("Invalid tunnel id.");
  return options;
}

function tunnelInstalled() {
  try {
    return execFileSync("tunnel-client", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function emit(options, value) {
  process.stdout.write(options.json ? `${JSON.stringify(value, null, 2)}\n` : `${value.message ?? JSON.stringify(value)}\n`);
}

function plan(options) {
  const version = tunnelInstalled();
  return {
    schemaVersion: "1",
    command: "chatgpt.plan",
    ok: true,
    privateOnly: true,
    tunnelClient: version ?? "missing",
    serverPath,
    steps: [
      "Build and pass `npm run doctor:live`.",
      "Create a private tunnel in OpenAI Platform and associate the intended ChatGPT workspace.",
      "Install the official tunnel-client release and provide its runtime key in a trusted terminal environment.",
      `Run node scripts/private-chatgpt.mjs init --tunnel-id tunnel_... --profile ${options.profile}.`,
      `Run node scripts/private-chatgpt.mjs doctor --profile ${options.profile}.`,
      `Keep node scripts/private-chatgpt.mjs run --profile ${options.profile} running while ChatGPT uses the connector.`,
      "In ChatGPT developer mode, add a Tunnel connection and review the discovered tools."
    ],
    blockers: [
      ...(version ? [] : ["tunnel-client is not installed or not on PATH."]),
      "Tunnel creation, workspace association, and runtime-key issuance require the user's OpenAI organization permissions."
    ],
    rollback: `Stop the tunnel-client process and remove profile ${options.profile} using the official tunnel-client profile/config instructions.`
  };
}

function requireClient() {
  if (!tunnelInstalled()) throw new Error("tunnel-client is missing. Install the official OpenAI release first; see docs/how-to/private-chatgpt.md.");
}

function safeDiagnostics(value) {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token)["'=:\s]+)[^\s,"'}]+/gi, "$1[redacted]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .slice(0, 5_000);
}

function call(args, mode = "inherit") {
  if (mode === "capture") {
    const result = spawnSync("tunnel-client", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.error) throw result.error;
    return {
      status: result.status ?? 1,
      diagnostics: safeDiagnostics(`${result.stdout ?? ""}${result.stderr ?? ""}`).trim()
    };
  }
  const result = spawnSync("tunnel-client", args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, diagnostics: "" };
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.command === "plan") {
    emit(options, plan(options));
    return;
  }
  requireClient();
  if (options.command === "init") {
    if (!options.tunnelId) throw new Error("init requires --tunnel-id tunnel_...");
    if (!process.env.CONTROL_PLANE_API_KEY && !process.env.OPENAI_API_KEY) {
      throw new Error("A tunnel runtime key is not available in this process. Set it in a trusted terminal; never pass it as a command argument.");
    }
    const mcpCommand = `node ${JSON.stringify(serverPath)}`;
    const result = call(
      ["init", "--sample", "sample_mcp_stdio_local", "--profile", options.profile, "--tunnel-id", options.tunnelId, "--mcp-command", mcpCommand],
      options.json ? "capture" : "inherit"
    );
    if (result.status !== 0) throw new Error(result.diagnostics || `tunnel-client init exited ${result.status}`);
    emit(options, { schemaVersion: "1", command: "chatgpt.init", ok: true, profile: options.profile, diagnostics: result.diagnostics || undefined, message: "Private tunnel profile initialized. Run the doctor command next." });
    return;
  }
  if (options.command === "doctor") {
    const result = call(["doctor", "--profile", options.profile, "--explain"], options.json ? "capture" : "inherit");
    emit(options, {
      schemaVersion: "1",
      command: "chatgpt.doctor",
      ok: result.status === 0,
      profile: options.profile,
      diagnostics: result.diagnostics || undefined,
      message: result.status === 0 ? "Tunnel diagnostics passed." : "Tunnel diagnostics failed; review the bounded diagnostics."
    });
    if (result.status !== 0) process.exitCode = 2;
    return;
  }
  if (options.command === "run") {
    process.exitCode = call(["run", "--profile", options.profile]).status;
    return;
  }
  throw new Error("Usage: private-chatgpt.mjs <plan|init|doctor|run> [--profile name] [--tunnel-id tunnel_...] [--json]");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Private ChatGPT setup failed";
  process.stdout.write(`${JSON.stringify({ schemaVersion: "1", command: "chatgpt", ok: false, error: message })}\n`);
  process.exitCode = 1;
});
