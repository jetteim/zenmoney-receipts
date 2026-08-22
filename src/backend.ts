import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

import { resolveCredential, type CredentialResult } from "./credentials.js";
import { buildExpenseDiff } from "./direct-write.js";
import { PrivacySafeEventStore } from "./observability.js";
import type { Backend, JsonObject } from "./types.js";
import { VERSION } from "./version.js";

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
  private readonly client = new Client({ name: "zenmoney-receipts-wrapper", version: VERSION });
  private transport: StdioClientTransport | null = null;
  private accessToken: string | null = null;
  private operationTail: Promise<void> = Promise.resolve();

  private readonly events: PrivacySafeEventStore;
  private readonly credentialResolver: () => CredentialResult | Promise<CredentialResult>;

  constructor(options: {
    events?: PrivacySafeEventStore;
    credentialResolver?: () => CredentialResult | Promise<CredentialResult>;
  } = {}) {
    this.events = options.events ?? new PrivacySafeEventStore();
    this.credentialResolver = options.credentialResolver ?? (() => resolveCredential());
  }

  async start(): Promise<void> {
    const credential = await this.credentialResolver();
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
    if (tool === "receipt_full_reference_snapshot") {
      return this.fullReferenceSnapshot();
    }
    const write = /(?:_create|_update|_delete)$/.test(tool) || tool === "receipt_transactions_create";
    const startedAt = Date.now();
    await this.safeEvent({
      outcome: "started",
      phase: write ? "write" : "read",
      durationMs: 0,
      code: write ? "backend_write" : "backend_read"
    });
    try {
      const value =
        tool === "receipt_transactions_create"
          ? await this.createReceiptTransaction(input)
          : parseToolResult(await this.client.callTool({ name: tool, arguments: input }));
      await this.safeEvent({
        outcome: "succeeded",
        phase: write ? "write" : "read",
        durationMs: Date.now() - startedAt,
        code: write ? "backend_write" : "backend_read"
      });
      return value;
    } catch (error) {
      await this.safeEvent({
        outcome: "failed",
        phase: write ? "write" : "read",
        durationMs: Date.now() - startedAt,
        code: write ? "backend_write_failed" : "backend_read_failed"
      });
      throw error;
    }
  }

  private async fullReferenceSnapshot(): Promise<unknown> {
    if (!this.accessToken) throw new Error("ZenMoney backend credential is unavailable");
    let response: Response;
    try {
      response = await fetch("https://api.zenmoney.ru/v8/diff/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentClientTimestamp: Math.floor(Date.now() / 1000),
          serverTimestamp: 0
        }),
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      throw new Error("ZenMoney full reference discovery failed or timed out");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`ZenMoney full reference discovery failed with status ${response.status}`);
    }
    const diff = asRecord(await response.json());
    const bounded = (name: string, limit: number): Record<string, unknown>[] => {
      const value = diff[name];
      if (!Array.isArray(value)) return [];
      if (value.length > limit) throw new Error(`ZenMoney ${name} reference set exceeds the safety limit`);
      return value.map(asRecord);
    };
    const entity = (record: Record<string, unknown>) => ({
      id: requireString(record.id, "id"),
      changed: requireNumber(record.changed, "changed"),
      tag: requireStringArray(record.tag ?? [], "tag"),
      deleted: record.deleted === true,
      state: typeof record.state === "string" ? record.state : null
    });
    return {
      transactions: bounded("transaction", 50_000).map(entity),
      reminders: bounded("reminder", 10_000).map(entity),
      reminderMarkers: bounded("reminderMarker", 50_000).map(entity),
      budgets: bounded("budget", 10_000).map((record) => ({
        changed: requireNumber(record.changed, "budget.changed"),
        user: typeof record.user === "number" || typeof record.user === "string" ? record.user : null,
        date: typeof record.date === "string" ? record.date : null,
        tag: typeof record.tag === "string" || record.tag === null ? record.tag : null
      }))
    };
  }

  private async safeEvent(input: {
    outcome: "started" | "succeeded" | "failed";
    phase: "read" | "write";
    durationMs: number;
    code: string;
  }): Promise<void> {
    try {
      await this.events.emit({
        name: "backend.call",
        component: "backend",
        operationKind: "none",
        ...input
      });
    } catch {
      // Diagnostics must never change the outcome of a ZenMoney operation.
    }
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

  constructor(private readonly options: ConstructorParameters<typeof ChildMcpBackend>[0] = {}) {}

  private async get(): Promise<ChildMcpBackend> {
    if (this.active) {
      return this.active;
    }
    this.pending ??= (async () => {
      const backend = new ChildMcpBackend(this.options);
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
