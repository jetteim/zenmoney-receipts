import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function resultValue(response) {
  if (response.isError === true) {
    const message = response.content?.find((item) => item.type === "text")?.text;
    throw new Error(message || "MCP tool returned an error");
  }
  const structured = response.structuredContent?.result;
  if (structured !== undefined) return structured;
  const text = response.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

const client = new Client({ name: "zenmoney-receipts-live-readonly", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] });

try {
  await client.connect(transport);

  const status = resultValue(
    await client.callTool({ name: "zenmoney_connection_status", arguments: {} })
  );
  if (status?.configured !== true) {
    throw new Error("ZenMoney credential is not configured");
  }

  resultValue(await client.callTool({ name: "zenmoney_sync", arguments: { full: false } }));
  const categories = resultValue(
    await client.callTool({
      name: "zenmoney_list_categories",
      arguments: { includeArchived: false }
    })
  );
  if (!Array.isArray(categories)) {
    throw new Error("category listing did not return an array");
  }

  process.stdout.write(
    `Live read-only test passed: Keychain credential, ZenMoney sync, ${categories.length} active categories. No writes requested.\n`
  );
} finally {
  await client.close();
}
