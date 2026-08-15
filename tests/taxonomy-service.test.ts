import { describe, expect, it } from "vitest";

import { ZenMoneyReceiptService } from "../src/service.js";
import type { Backend, JsonObject } from "../src/types.js";

function tag(input: Partial<Record<string, unknown>> & { id: string; title: string }) {
  return {
    changed: 10,
    parent: null,
    showIncome: false,
    showOutcome: true,
    budgetIncome: false,
    budgetOutcome: true,
    required: null,
    ...input
  };
}

class TaxonomyBackend implements Backend {
  readonly calls: Array<{ tool: string; input: JsonObject }> = [];
  readonly tags = new Map<string, Record<string, unknown>>([
    ["daily", tag({ id: "daily", title: "Daily" })],
    ["food", tag({ id: "food", title: "Food", parent: "daily" })],
    ["travel", tag({ id: "travel", title: "Travel" })],
    ["old", tag({ id: "old", title: "Old category" })]
  ]);
  readonly transaction = { id: "tx-history", tag: ["old"], changed: 4 };
  private changed = 20;
  private createSequence = 0;

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    this.calls.push({ tool, input });
    switch (tool) {
      case "sync_status":
        return { initialized: true };
      case "sync_run":
        return { initialized: true };
      case "tags_list":
        return [...this.tags.values()];
      case "tags_create": {
        const id = `created-${++this.createSequence}`;
        const changed = ++this.changed;
        this.tags.set(id, { id, changed, ...input });
        return { status: "applied", entity: "tag", id, sentChanged: changed };
      }
      case "tags_update": {
        const id = String(input.id);
        const current = this.tags.get(id);
        if (!current) throw new Error("missing fixture category");
        if (current.changed !== input.expectedChanged) throw new Error("stale fixture category");
        const changed = ++this.changed;
        this.tags.set(id, { ...current, ...(input.patch as Record<string, unknown>), changed });
        return { status: "applied", entity: "tag", id, sentChanged: changed };
      }
      default:
        throw new Error(`unexpected tool: ${tool}`);
    }
  }

  async close(): Promise<void> {}
}

function writes(backend: TaxonomyBackend) {
  return backend.calls.filter((call) => call.tool === "tags_create" || call.tool === "tags_update");
}

describe("taxonomy management", () => {
  it("previews and creates an exact child category without duplicate writes", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewCategoryCreate({
      title: "Groceries",
      parentId: "daily",
      showIncome: false,
      showOutcome: true,
      budgetIncome: false,
      budgetOutcome: true,
      required: true
    });

    expect(writes(backend)).toHaveLength(0);
    expect(preview).toMatchObject({
      proposed: { title: "Groceries", parent: "daily", required: true },
      requiresConfirmation: true
    });

    const applied = await service.applyCategoryCreate({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(applied).toMatchObject({
      applied: true,
      verified: true,
      operation: "create",
      category: { title: "Groceries", parent: "daily", showOutcome: true }
    });
    const writeCount = writes(backend).length;

    const repeated = await service.applyCategoryCreate({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(repeated).toMatchObject({ applied: false, alreadyApplied: true, verified: true });
    expect(writes(backend)).toHaveLength(writeCount);
  });

  it("previews and applies only the requested rename and move", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewCategoryUpdate({
      categoryId: "food",
      title: "Food & groceries",
      parentId: "travel"
    });

    expect(writes(backend)).toHaveLength(0);
    expect(preview.exactPatch).toEqual({ title: "Food & groceries", parent: "travel" });

    const result = await service.applyCategoryUpdate({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(result).toMatchObject({
      applied: true,
      verified: true,
      category: { id: "food", title: "Food & groceries", parent: "travel" }
    });
    expect(writes(backend)).toEqual([
      {
        tool: "tags_update",
        input: {
          id: "food",
          expectedChanged: 10,
          patch: { title: "Food & groceries", parent: "travel" }
        }
      }
    ]);
  });

  it("rejects stale updates before the write transport", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewCategoryUpdate({ categoryId: "food", title: "Meals" });
    backend.tags.set("food", { ...backend.tags.get("food")!, changed: 11, title: "Changed elsewhere" });

    await expect(
      service.applyCategoryUpdate({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("changed after preview");
    expect(writes(backend)).toHaveLength(0);
  });

  it("retires a leaf without deleting or recategorizing history", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);
    const beforeTransaction = structuredClone(backend.transaction);
    const preview = await service.previewCategoryRetirement({ categoryId: "old" });

    expect(writes(backend)).toHaveLength(0);
    expect(preview).toMatchObject({ historicalReferences: "preserved", requiresConfirmation: true });

    const result = await service.applyCategoryRetirement({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(result).toMatchObject({
      applied: true,
      verified: true,
      operation: "retire",
      category: {
        id: "old",
        retired: true,
        showIncome: false,
        showOutcome: false,
        budgetIncome: false,
        budgetOutcome: false
      }
    });
    expect(backend.transaction).toEqual(beforeTransaction);
    expect((await service.listCategories(false)).some((category) => category.id === "old")).toBe(false);
    expect((await service.listCategories(true)).some((category) => category.id === "old")).toBe(true);
  });

  it("rechecks active children before applying retirement", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewCategoryRetirement({ categoryId: "travel" });
    backend.tags.set("late-child", tag({ id: "late-child", title: "Late child", parent: "travel" }));

    await expect(
      service.applyCategoryRetirement({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("active child category was added");
    expect(writes(backend)).toHaveLength(0);
  });

  it("defends hierarchy, duplicate-name, and implicit-retirement boundaries", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);

    await expect(
      service.previewCategoryCreate({
        title: "  FOOD  ",
        parentId: "daily",
        showIncome: false,
        showOutcome: true,
        budgetIncome: false,
        budgetOutcome: true
      })
    ).rejects.toThrow("same normalized title");
    await expect(
      service.previewCategoryCreate({
        title: "Nested",
        parentId: "food",
        showIncome: false,
        showOutcome: true,
        budgetIncome: false,
        budgetOutcome: true
      })
    ).rejects.toThrow("one category parent level");
    await expect(
      service.previewCategoryUpdate({
        categoryId: "travel",
        showOutcome: false,
        budgetOutcome: false
      })
    ).rejects.toThrow("retirement preview");
    await expect(service.previewCategoryRetirement({ categoryId: "daily" })).rejects.toThrow(
      "active child categories"
    );
    expect(writes(backend)).toHaveLength(0);
  });

  it("rejects control characters before any write", async () => {
    const backend = new TaxonomyBackend();
    const service = new ZenMoneyReceiptService(backend);

    await expect(
      service.previewCategoryUpdate({ categoryId: "food", title: "Unsafe\u0000name" })
    ).rejects.toThrow("control characters");
    expect(writes(backend)).toHaveLength(0);
  });

  it("refuses taxonomy writes when the complete category set cannot be bounded", async () => {
    const backend = new TaxonomyBackend();
    for (let index = 0; index < 501; index += 1) {
      const id = `bulk-${index}`;
      backend.tags.set(id, tag({ id, title: `Bulk ${index}` }));
    }

    await expect(
      new ZenMoneyReceiptService(backend).previewCategoryUpdate({
        categoryId: "food",
        title: "Meals"
      })
    ).rejects.toThrow("exceeds 500 records");
    expect(writes(backend)).toHaveLength(0);
  });
});
