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
  if (
    !categories.every(
      (category) =>
        Number.isInteger(category.changed) &&
        category.changed >= 0 &&
        ["showIncome", "showOutcome", "budgetIncome", "budgetOutcome", "retired"].every(
          (field) => typeof category[field] === "boolean"
        )
    )
  ) {
    throw new Error("live category projection is missing taxonomy concurrency or behavior fields");
  }
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  if (
    !categories.every(
      (category) =>
        category.parent === null ||
        !categoriesById.has(category.parent) ||
        categoriesById.get(category.parent).parent === null
    )
  ) {
    throw new Error("live categories exceed ZenMoney's supported one-parent hierarchy");
  }

  const parentIds = new Set(categories.map((category) => category.parent).filter(Boolean));
  const leaf = categories.find((category) => !parentIds.has(category.id));
  if (!leaf) throw new Error("no active leaf category is available for read-only preview checks");

  const createPreview = resultValue(
    await client.callTool({
      name: "zenmoney_preview_category_create",
      arguments: { title: `__preview_only_${Date.now()}__`, parentId: null }
    })
  );
  const updatePreview = resultValue(
    await client.callTool({
      name: "zenmoney_preview_category_update",
      arguments: { categoryId: leaf.id, required: leaf.required !== true }
    })
  );
  const retirementPreview = resultValue(
    await client.callTool({
      name: "zenmoney_preview_category_retirement",
      arguments: { categoryId: leaf.id }
    })
  );
  if (
    ![createPreview, updatePreview, retirementPreview].every(
      (preview) => preview?.requiresConfirmation === true && typeof preview.previewToken === "string"
    )
  ) {
    throw new Error("one or more live taxonomy previews did not return a confirmation boundary");
  }

  process.stdout.write(
    `Live read-only test passed: Keychain credential, ZenMoney sync, ${categories.length} active categories, taxonomy projection, one-level hierarchy, and 3 unapplied taxonomy previews. No writes requested.\n`
  );
} finally {
  await client.close();
}
