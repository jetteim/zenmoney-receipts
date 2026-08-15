import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/server.js";
import { ZenMoneyReceiptService } from "../src/service.js";
import type { Backend } from "../src/types.js";

const unusedBackend: Backend = {
  async call() {
    throw new Error("backend should not be called");
  },
  async close() {}
};

describe("MCP contract", () => {
  it("advertises a bounded tool set with accurate mutation annotations", async () => {
    const service = new ZenMoneyReceiptService(unusedBackend);
    const server = createServer(service);
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "zenmoney_connection_status",
      "zenmoney_sync",
      "zenmoney_list_accounts",
      "zenmoney_list_categories",
      "zenmoney_list_transactions",
      "zenmoney_match_receipt",
      "zenmoney_preview_receipt_category",
      "zenmoney_apply_receipt_category",
      "zenmoney_category_summary"
    ]);
    const apply = result.tools.find((tool) => tool.name === "zenmoney_apply_receipt_category");
    expect(apply?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    });
    expect(apply?.inputSchema).toMatchObject({
      required: expect.arrayContaining(["previewToken", "confirmed"])
    });

    const status = await client.callTool({ name: "zenmoney_connection_status", arguments: {} });
    expect(status.isError).not.toBe(true);
    expect(status.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text" })])
    );

    await client.close();
    await server.close();
  });
});
