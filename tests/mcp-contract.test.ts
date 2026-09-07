import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer, SERVER_INSTRUCTIONS } from "../src/server.js";
import { ZenMoneyReceiptService } from "../src/service.js";
import type { HostedOAuthTools } from "../src/hosted-oauth-tools.js";
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
      "zenmoney_capabilities",
      "zenmoney_preferences",
      "zenmoney_preview_preferences",
      "zenmoney_apply_preferences",
      "zenmoney_connection_status",
      "zenmoney_sync",
      "zenmoney_list_operation_recovery",
      "zenmoney_inspect_operation_recovery",
      "zenmoney_list_accounts",
      "zenmoney_list_categories",
      "zenmoney_preview_category_create",
      "zenmoney_apply_category_create",
      "zenmoney_preview_category_update",
      "zenmoney_apply_category_update",
      "zenmoney_preview_category_retirement",
      "zenmoney_apply_category_retirement",
      "zenmoney_preview_category_consolidation",
      "zenmoney_apply_category_consolidation",
      "zenmoney_list_transactions",
      "zenmoney_get_transaction",
      "zenmoney_suggest_categories",
      "zenmoney_match_receipt",
      "zenmoney_preview_receipt_category",
      "zenmoney_apply_receipt_category",
      "zenmoney_preview_receipt_reconciliation",
      "zenmoney_apply_receipt_reconciliation",
      "zenmoney_preview_new_receipt",
      "zenmoney_apply_new_receipt",
      "zenmoney_receipt_memory_status",
      "zenmoney_receipt_memory_search",
      "zenmoney_receipt_memory_get",
      "zenmoney_preview_receipt_memory_settings",
      "zenmoney_apply_receipt_memory_settings",
      "zenmoney_preview_receipt_memory_delete",
      "zenmoney_apply_receipt_memory_delete",
      "zenmoney_preview_receipt_memory_purge",
      "zenmoney_apply_receipt_memory_purge",
      "zenmoney_category_summary",
      "zenmoney_spending_insights"
    ]);
    const apply = result.tools.find((tool) => tool.name === "zenmoney_apply_receipt_category");
    const capabilities = await client.callTool({ name: "zenmoney_capabilities", arguments: {} });
    expect(capabilities.isError).not.toBe(true);
    expect(capabilities.structuredContent).toMatchObject({ result: { mode: "local", connection: { liveVerified: false }, host: { loadedSkills: "unknown" } } });
    expect(apply?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    });
    expect(apply?.inputSchema).toMatchObject({
      required: expect.arrayContaining(["previewToken", "confirmed"])
    });
    const reconcile = result.tools.find(
      (tool) => tool.name === "zenmoney_apply_receipt_reconciliation"
    );
    expect(reconcile?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true
    });
    const taxonomyCreate = result.tools.find(
      (tool) => tool.name === "zenmoney_apply_category_create"
    );
    expect(taxonomyCreate?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    });
    const taxonomyUpdate = result.tools.find(
      (tool) => tool.name === "zenmoney_apply_category_update"
    );
    expect(taxonomyUpdate?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true
    });
    const consolidation = result.tools.find(
      (tool) => tool.name === "zenmoney_apply_category_consolidation"
    );
    expect(consolidation?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    });
    const matchReceipt = result.tools.find((tool) => tool.name === "zenmoney_match_receipt");
    expect(matchReceipt?.inputSchema.required).not.toContain("date");
    const previewNewReceipt = result.tools.find(
      (tool) => tool.name === "zenmoney_preview_new_receipt"
    );
    expect(previewNewReceipt?.inputSchema.required).not.toContain("date");
    expect(previewNewReceipt?.inputSchema.required).not.toContain("accountId");
    expect(previewNewReceipt?.inputSchema.properties).toHaveProperty("accountHint");
    expect(previewNewReceipt?.inputSchema.properties).toHaveProperty("evidenceGroups");
    const memorySearch = result.tools.find(
      (tool) => tool.name === "zenmoney_receipt_memory_search"
    );
    expect(memorySearch?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    const memoryPurge = result.tools.find(
      (tool) => tool.name === "zenmoney_apply_receipt_memory_purge"
    );
    expect(memoryPurge?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    });
    const recovery = result.tools.find(
      (tool) => tool.name === "zenmoney_inspect_operation_recovery"
    );
    expect(recovery?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    });
    expect(SERVER_INSTRUCTIONS).toContain("preview each exact category create, update, or retirement");
    expect(SERVER_INSTRUCTIONS).toContain("never exposes arbitrary deletion");
    expect(SERVER_INSTRUCTIONS).toContain("Fresh fruit, Fresh vegetables, or Herbs");
    expect(SERVER_INSTRUCTIONS).toContain("never broad labels such as Produce");
    expect(SERVER_INSTRUCTIONS).toContain("immediately run a read-only category review");
    expect(SERVER_INSTRUCTIONS.slice(0, 512)).toContain("reconciliation preview/apply pair");
    expect(SERVER_INSTRUCTIONS.slice(0, 512)).toContain("even with no instructions");
    expect(SERVER_INSTRUCTIONS).toContain("Never ask the user to restate this workflow");
    expect(SERVER_INSTRUCTIONS).toContain("only after the user explicitly confirms");
    expect(SERVER_INSTRUCTIONS).toContain("Do not ask routinely for a missing date or paying account");
    expect(SERVER_INSTRUCTIONS).toContain("visibly mark every item in suggestedFields");
    expect(SERVER_INSTRUCTIONS).toContain("operationId with operation recovery inspection");

    const status = await client.callTool({ name: "zenmoney_connection_status", arguments: {} });
    expect(status.isError).not.toBe(true);
    expect(status.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text" })])
    );

    await client.close();
    await server.close();
  });

  it("adds only the bounded authorization and tenant-deletion tools in hosted mode", async () => {
    const service = new ZenMoneyReceiptService(unusedBackend);
    const server = createServer(service, {} as HostedOAuthTools);
    const client = new Client({ name: "hosted-contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.some(tool => tool.name.includes("preferences"))).toBe(false);
    const hostedNames = tools.tools.map((tool) => tool.name).filter((name) => name.includes("oauth") || name.includes("hosted_data"));
    expect(hostedNames).toEqual([
      "zenmoney_oauth_status",
      "zenmoney_begin_oauth_link",
      "zenmoney_preview_oauth_unlink",
      "zenmoney_apply_oauth_unlink",
      "zenmoney_preview_hosted_data_deletion",
      "zenmoney_apply_hosted_data_deletion"
    ]);
    expect(tools.tools.find((tool) => tool.name === "zenmoney_apply_hosted_data_deletion")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true
    });
    await client.close();
    await server.close();
  });
});
