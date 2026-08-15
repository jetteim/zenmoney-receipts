#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const end = new Date();
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - 89);
const dateFrom = start.toISOString().slice(0, 10);
const dateTo = end.toISOString().slice(0, 10);

const client = new Client({ name: "zenmoney-live-insights-check", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [resolve(root, "dist/index.js")],
  stderr: "pipe"
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "zenmoney_spending_insights",
    arguments: { dateFrom, dateTo, limit: 500 }
  });
  if (result.isError) throw new Error("Spending-insights MCP call returned an error.");
  const value = result.structuredContent?.result;
  if (typeof value !== "object" || value === null || !Array.isArray(value.instruments)) {
    throw new Error("Spending-insights MCP call returned an unexpected shape.");
  }
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: "1",
      command: "live-insights",
      ok: true,
      periodDays: 90,
      transactionCountExamined: value.transactionCountExamined,
      expenseTransactionCount: value.expenseTransactionCount,
      instrumentCount: value.instruments.length,
      possiblyTruncated: value.possiblyTruncated,
      privacy: "No amounts, payees, category names, transaction IDs, or credentials were printed; no writes were requested."
    }, null, 2)}\n`
  );
} finally {
  await client.close();
}
