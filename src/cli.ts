import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { LazyBackend } from "./backend.js";
import { credentialStatus } from "./credentials.js";
import { createServer } from "./server.js";
import { ZenMoneyReceiptService } from "./service.js";
import { ReceiptMemoryController } from "./receipt-memory.js";
import type { Backend } from "./types.js";
import { VERSION } from "./version.js";

type CheckStatus = "pass" | "warn" | "fail";

interface Check {
  id: string;
  status: CheckStatus;
  detail: string;
  remediation?: string;
}

const executableDir = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(executableDir, "index.js");

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function commandResult(command: string, args: string[]): { ok: boolean; stdout: string } {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000
      }).trim()
    };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function nodeCheck(): Check {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const supported = major > 20 || (major === 20 && minor >= 11);
  return supported
    ? { id: "runtime.node", status: "pass", detail: `Node.js ${process.versions.node}` }
    : {
        id: "runtime.node",
        status: "fail",
        detail: `Node.js ${process.versions.node} is unsupported`,
        remediation: "Install Node.js 20.11 or newer."
      };
}

function credentialCheck(): Check {
  const status = credentialStatus();
  return status.configured
    ? {
        id: "auth.zenmoney",
        status: "pass",
        detail: `Credential available from ${status.source}; its value was not read into output.`
      }
    : {
        id: "auth.zenmoney",
        status: "fail",
        detail: "No ZenMoney credential is available.",
        remediation: "On macOS run ./scripts/auth-macos.sh, or provide the credential only in the MCP process environment."
      };
}

function codexCheck(): Check {
  const result = commandResult("codex", ["mcp", "get", "zenmoney-receipts", "--json"]);
  if (!result.ok) {
    return {
      id: "host.codex",
      status: "warn",
      detail: "Codex registration was not found or Codex is unavailable.",
      remediation: "Run node scripts/install.mjs --host codex."
    };
  }
  try {
    const registration = JSON.parse(result.stdout) as {
      enabled?: boolean;
      transport?: { command?: string; args?: string[] };
    };
    const configuredPath = registration.transport?.args?.at(-1);
    const samePath = configuredPath === serverPath;
    return samePath && registration.enabled !== false
      ? { id: "host.codex", status: "pass", detail: "Codex points to this build." }
      : {
          id: "host.codex",
          status: "warn",
          detail: "Codex has a different or disabled zenmoney-receipts registration.",
          remediation: "Inspect `codex mcp get zenmoney-receipts --json` before replacing it."
        };
  } catch {
    return {
      id: "host.codex",
      status: "warn",
      detail: "Codex registration output could not be parsed.",
      remediation: "Inspect `codex mcp get zenmoney-receipts --json`."
    };
  }
}

function tunnelCheck(): Check {
  const result = commandResult("tunnel-client", ["--version"]);
  return result.ok
    ? { id: "host.chatgpt-tunnel", status: "pass", detail: result.stdout || "tunnel-client is installed." }
    : {
        id: "host.chatgpt-tunnel",
        status: "warn",
        detail: "OpenAI tunnel-client is not on PATH.",
        remediation: "Follow docs/how-to/private-chatgpt.md; this is required only for private ChatGPT use."
      };
}

async function receiptMemoryCheck(): Promise<Check> {
  const status = await new ReceiptMemoryController().status();
  if (status.corrupt) {
    const unsafePermissions =
      status.error?.includes("group or other users") === true ||
      status.error?.includes("owned by the current user") === true;
    return {
      id: "storage.receipt-memory",
      status: "fail",
      detail: status.error ?? "Local receipt memory is corrupt.",
      remediation: unsafePermissions
        ? "Move the store to a dedicated current-user directory with 0700 permissions; the connector will not chmod an existing shared path."
        : "Run `zenmoney-receipts memory purge`, inspect the exact preview, then rerun with --confirm."
    };
  }
  return status.enabled
    ? {
        id: "storage.receipt-memory",
        status: "pass",
        detail: `Enabled with ${status.retentionDays} day retention and ${status.activeRecordCount} active records.`
      }
    : {
        id: "storage.receipt-memory",
        status: "warn",
        detail: `Disabled; no new receipt evidence will be retained. Data location: ${status.dataLocation}`,
        remediation: "Run `zenmoney-receipts memory enable`, inspect the preview, then rerun with --confirm."
      };
}

async function liveCheck(): Promise<Check> {
  const service = new ZenMoneyReceiptService(new LazyBackend());
  try {
    await service.sync(false);
    const categories = await service.listCategories(false);
    return {
      id: "live.zenmoney-readonly",
      status: "pass",
      detail: `Synchronization succeeded and returned ${categories.length} active categories; no records were printed or changed.`
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 240) : "Read-only verification failed.";
    return {
      id: "live.zenmoney-readonly",
      status: "fail",
      detail,
      remediation: "Refresh the credential and rerun `npm run doctor:live`."
    };
  } finally {
    await service.close();
  }
}

async function doctor(live: boolean): Promise<number> {
  const checks = [
    nodeCheck(),
    {
      id: "build.server",
      status: existsSync(serverPath) ? "pass" : "fail",
      detail: existsSync(serverPath) ? "MCP server build exists." : "MCP server build is missing.",
      ...(existsSync(serverPath) ? {} : { remediation: "Run npm run build." })
    } satisfies Check,
    credentialCheck(),
    codexCheck(),
    tunnelCheck(),
    await receiptMemoryCheck()
  ];
  if (live) checks.push(await liveCheck());
  const ok = checks.every((check) => check.status !== "fail");
  output({ schemaVersion: "1", command: "doctor", version: VERSION, ok, live, checks });
  return ok ? 0 : 2;
}

const unusedBackend: Backend = {
  async call() {
    throw new Error("schema discovery must not call ZenMoney");
  },
  async close() {}
};

async function schema(): Promise<number> {
  const service = new ZenMoneyReceiptService(unusedBackend);
  const server = createServer(service);
  const client = new Client({ name: "zenmoney-receipts-cli", version: VERSION });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.listTools();
    output({
      schemaVersion: "1",
      command: "schema",
      version: VERSION,
      ok: true,
      tools: result.tools.map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        title,
        description,
        inputSchema,
        annotations
      }))
    });
    return 0;
  } finally {
    await client.close();
    await server.close();
  }
}

function parseMemoryOptions(args: string[]): {
  positionals: string[];
  values: Map<string, string>;
  confirm: boolean;
} {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  let confirm = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--confirm") {
      if (confirm) throw new Error("--confirm may be supplied only once");
      confirm = true;
      continue;
    }
    if (argument.startsWith("--")) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      if (values.has(argument)) throw new Error(`${argument} may be supplied only once`);
      values.set(argument, value);
      index += 1;
      continue;
    }
    positionals.push(argument);
  }
  return { positionals, values, confirm };
}

function requireAllowedOptions(
  parsed: ReturnType<typeof parseMemoryOptions>,
  allowed: string[]
): void {
  for (const option of parsed.values.keys()) {
    if (!allowed.includes(option)) throw new Error(`unsupported option: ${option}`);
  }
}

function integerOption(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be an integer`);
  return Number(value);
}

async function memory(args: string[]): Promise<number> {
  const [action, ...rest] = args;
  const parsed = parseMemoryOptions(rest);
  const controller = new ReceiptMemoryController();
  const respond = (result: unknown) => {
    output({ schemaVersion: "1", command: `memory.${action ?? "help"}`, ok: true, result });
    return 0;
  };

  if (action === "status") {
    requireAllowedOptions(parsed, []);
    if (parsed.confirm || parsed.positionals.length > 0) throw new Error("memory status takes no arguments");
    return respond(await controller.status());
  }
  if (action === "search") {
    requireAllowedOptions(parsed, ["--query", "--category-id", "--month-from", "--month-to", "--limit"]);
    if (parsed.confirm || parsed.positionals.length > 0) throw new Error("memory search accepts only filter options");
    return respond(
      await controller.search({
        query: parsed.values.get("--query"),
        categoryId: parsed.values.get("--category-id"),
        monthFrom: parsed.values.get("--month-from"),
        monthTo: parsed.values.get("--month-to"),
        limit: integerOption(parsed.values.get("--limit"), "limit")
      })
    );
  }
  if (action === "get") {
    requireAllowedOptions(parsed, []);
    if (parsed.confirm || parsed.positionals.length !== 1) throw new Error("memory get requires one record id");
    return respond(await controller.get(parsed.positionals[0]!));
  }
  if (action === "enable" || action === "disable") {
    requireAllowedOptions(parsed, ["--retention-days"]);
    if (parsed.positionals.length > 0) throw new Error(`memory ${action} takes no positional arguments`);
    const retentionDays = integerOption(parsed.values.get("--retention-days"), "retention-days");
    const preview = await controller.previewSettings({
      enabled: action === "enable",
      ...(retentionDays === undefined ? {} : { retentionDays })
    });
    if (!parsed.confirm) return respond(preview);
    return respond(
      await controller.applySettings({ previewToken: preview.previewToken, confirmed: true })
    );
  }
  if (action === "delete") {
    requireAllowedOptions(parsed, []);
    if (parsed.positionals.length !== 1) throw new Error("memory delete requires one record id");
    const preview = await controller.previewDelete(parsed.positionals[0]!);
    if (!parsed.confirm) return respond(preview);
    return respond(await controller.applyDelete({ previewToken: preview.previewToken, confirmed: true }));
  }
  if (action === "purge") {
    requireAllowedOptions(parsed, []);
    if (parsed.positionals.length > 0) throw new Error("memory purge takes no positional arguments");
    const preview = await controller.previewPurge();
    if (!parsed.confirm) return respond(preview);
    return respond(await controller.applyPurge({ previewToken: preview.previewToken, confirmed: true }));
  }
  throw new Error(
    "Usage: zenmoney-receipts memory <status | search | get ID | enable | disable | delete ID | purge> [options] [--confirm]"
  );
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "doctor") return doctor(args.includes("--live"));
  if (command === "schema") return schema();
  if (command === "memory") return memory(args);
  output({
    schemaVersion: "1",
    command: command ?? "help",
    ok: false,
    error: "Usage: zenmoney-receipts <doctor [--live] | schema | memory ...>"
  });
  return 64;
}

process.exitCode = await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.slice(0, 500) : "Unexpected CLI failure";
  output({ schemaVersion: "1", command: process.argv[2] ?? "unknown", ok: false, error: message });
  return 1;
});
