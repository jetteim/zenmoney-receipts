import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

import { resolveCredential } from "./credentials.js";
import { buildExpenseDiff } from "./direct-write.js";
import type { Backend, JsonObject } from "./types.js";

export function backendEnvironment(
  credential: string,
  environment: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  return {
    PATH: environment.PATH ?? "",
    HOME: environment.HOME ?? "",
    LANG: environment.LANG ?? "C.UTF-8",
    ZENMONEY_ACCESS_TOKEN: credential,
    ZENMONEY_ENABLE_WRITE_TOOLS: "true",
    ZENMONEY_SYNC_ON_START: "false"
  };
}

function parseToolResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null) {
    throw new Error("ZenMoney backend returned an invalid response");
  }

  const record = result as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content
    .filter(
      (item): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).type === "text" &&
        typeof (item as Record<string, unknown>).text === "string"
    )
    .map((item) => item.text)
    .join("\n");

  if (record.isError === true) {
    throw new Error(text || "ZenMoney backend request failed");
  }
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("ZenMoney backend returned non-JSON output");
  }
}

export class ChildMcpBackend implements Backend {
  private readonly client = new Client({ name: "zenmoney-receipts-wrapper", version: "0.2.0" });
  private transport: StdioClientTransport | null = null;
  private accessToken: string | null = null;
  private operationTail: Promise<void> = Promise.resolve();

  async start(): Promise<void> {
    const credential = resolveCredential();
    if (!credential.token) {
      throw new Error(
        "ZenMoney access token is not configured. Set ZENMONEY_ACCESS_TOKEN or add the macOS Keychain item described in README.md."
      );
    }
    this.accessToken = credential.token;

    const entry = fileURLToPath(new URL("./backend-entry.js", import.meta.url));
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry, "--enable-write-tools"],
      env: backendEnvironment(credential.token),
      stderr: "pipe"
    });
    await this.client.connect(this.transport);
  }

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    const result = this.operationTail.then(() => this.callNow(tool, input));
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async callNow(tool: string, input: JsonObject): Promise<unknown> {
    if (!this.transport) {
      throw new Error("ZenMoney backend is not connected");
    }
    if (tool === "receipt_transactions_create") {
      return this.createReceiptTransaction(input);
    }
    const result = await this.client.callTool({ name: tool, arguments: input });
    return parseToolResult(result);
  }

  private async createReceiptTransaction(input: JsonObject): Promise<unknown> {
    if (!this.accessToken) throw new Error("ZenMoney backend credential is unavailable");
    const sync = asRecord(
      parseToolResult(
        await this.client.callTool({ name: "sync_run", arguments: { full: false } })
      )
    );
    const accounts = parseToolResult(
      await this.client.callTool({
        name: "accounts_list",
        arguments: { includeArchived: true }
      })
    );
    const accountId = requireString(input.accountId, "accountId");
    const account = Array.isArray(accounts)
      ? accounts.map(asRecord).find((candidate) => String(candidate.id) === accountId)
      : undefined;
    if (!account || account.archive === true) throw new Error("receipt account is unavailable");

    const instrument = requireNumber(input.instrument, "instrument");
    if (account.instrument !== instrument) throw new Error("receipt account instrument changed");
    const user = account.user;
    if (typeof user !== "number" && typeof user !== "string") {
      throw new Error("receipt account has no user owner");
    }
    const serverTimestamp = requireNumber(sync.serverTimestamp, "serverTimestamp");
    const changed = Math.floor(Date.now() / 1000);
    const id = requireString(input.id, "id");
    const body = buildExpenseDiff({
      id,
      changed,
      serverTimestamp,
      user,
      accountId,
      instrument,
      amount: requireNumber(input.amount, "amount"),
      tagIds: requireStringArray(input.tagIds, "tagIds"),
      merchant: optionalString(input.merchant, "merchant"),
      payee: optionalString(input.payee, "payee"),
      comment: optionalString(input.comment, "comment"),
      date: requireString(input.date, "date")
    });

    let response: Response;
    try {
      response = await fetch("https://api.zenmoney.ru/v8/diff/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      throw new Error("ZenMoney receipt create request failed or timed out");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`ZenMoney receipt create failed with status ${response.status}`);
    }
    await response.json();

    parseToolResult(
      await this.client.callTool({ name: "sync_run", arguments: { full: false } })
    );
    const created = asRecord(
      parseToolResult(
        await this.client.callTool({ name: "transactions_get", arguments: { id } })
      )
    );
    if (String(created.id) !== id || created.deleted === true) {
      throw new Error("ZenMoney did not confirm the created receipt transaction");
    }
    const snapshotChanged = requireNumber(created.changed, "created.changed");
    return {
      status: "applied",
      entity: "transaction",
      id,
      operation: "create",
      sentChanged: changed,
      snapshotChanged
    };
  }

  async close(): Promise<void> {
    await this.operationTail;
    try {
      if (this.transport) await this.client.close();
    } finally {
      this.transport = null;
      this.accessToken = null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} is required`);
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${field} must be a string array`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`);
  return value;
}

export class LazyBackend implements Backend {
  private pending: Promise<ChildMcpBackend> | null = null;
  private active: ChildMcpBackend | null = null;

  private async get(): Promise<ChildMcpBackend> {
    if (this.active) {
      return this.active;
    }
    this.pending ??= (async () => {
      const backend = new ChildMcpBackend();
      await backend.start();
      this.active = backend;
      return backend;
    })();

    try {
      return await this.pending;
    } catch (error) {
      this.pending = null;
      throw error;
    }
  }

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    return (await this.get()).call(tool, input);
  }

  async close(): Promise<void> {
    await this.active?.close();
    this.active = null;
    this.pending = null;
  }
}
