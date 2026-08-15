import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedTools = [
  "zenmoney_connection_status",
  "zenmoney_sync",
  "zenmoney_list_accounts",
  "zenmoney_list_categories",
  "zenmoney_list_transactions",
  "zenmoney_match_receipt",
  "zenmoney_preview_receipt_category",
  "zenmoney_apply_receipt_category",
  "zenmoney_category_summary"
];

const client = new Client({ name: "zenmoney-receipts-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const actual = listed.tools.map((tool) => tool.name);
  if (JSON.stringify(actual) !== JSON.stringify(expectedTools)) {
    throw new Error(`unexpected MCP tools: ${actual.join(", ")}`);
  }
  const status = await client.callTool({ name: "zenmoney_connection_status", arguments: {} });
  if (status.isError === true) {
    throw new Error("connection status tool returned an MCP error");
  }
  process.stdout.write(`MCP smoke test passed (${actual.length} tools).\n`);
} finally {
  await client.close();
}

const previousCredential = process.env.ZENMONEY_ACCESS_TOKEN;
process.env.ZENMONEY_ACCESS_TOKEN = "mcp-backend-smoke-placeholder";
const { ChildMcpBackend } = await import("../dist/backend.js");
const backend = new ChildMcpBackend();
try {
  await backend.start();
  const status = await backend.call("sync_status");
  if (typeof status !== "object" || status === null || status.initialized !== false) {
    throw new Error("private backend did not start with synchronization disabled");
  }
  process.stdout.write("Private backend process smoke test passed.\n");
} finally {
  await backend.close();
  if (previousCredential === undefined) {
    delete process.env.ZENMONEY_ACCESS_TOKEN;
  } else {
    process.env.ZENMONEY_ACCESS_TOKEN = previousCredential;
  }
}
