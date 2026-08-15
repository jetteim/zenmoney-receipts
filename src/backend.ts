import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

import { resolveCredential } from "./credentials.js";
import type { Backend, JsonObject } from "./types.js";

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
  private readonly client = new Client({ name: "zenmoney-receipts-wrapper", version: "0.1.0" });
  private transport: StdioClientTransport | null = null;

  async start(): Promise<void> {
    const credential = resolveCredential();
    if (!credential.token) {
      throw new Error(
        "ZenMoney access token is not configured. Set ZENMONEY_ACCESS_TOKEN or add the macOS Keychain item described in README.md."
      );
    }

    const entry = fileURLToPath(new URL("./backend-entry.js", import.meta.url));
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry, "--enable-write-tools"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        ZENMONEY_TOKEN: credential.token,
        ZENMONEY_ENABLE_WRITE_TOOLS: "true",
        ZENMONEY_SYNC_ON_START: "false"
      },
      stderr: "pipe"
    });
    await this.client.connect(this.transport);
  }

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    if (!this.transport) {
      throw new Error("ZenMoney backend is not connected");
    }
    const result = await this.client.callTool({ name: tool, arguments: input });
    return parseToolResult(result);
  }

  async close(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      this.transport = null;
    }
  }
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
