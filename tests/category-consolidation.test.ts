import { describe, expect, it } from "vitest";

import { ZenMoneyReceiptService } from "../src/service.js";
import type { Backend, JsonObject } from "../src/types.js";

function tag(id: string, title: string) {
  return {
    id,
    title,
    changed: 10,
    parent: "daily",
    showIncome: false,
    showOutcome: true,
    budgetIncome: false,
    budgetOutcome: true,
    required: null,
    archive: false
  };
}

class ConsolidationBackend implements Backend {
  readonly calls: Array<{ tool: string; input: JsonObject }> = [];
  readonly tags = new Map<string, Record<string, unknown>>([
    ["source", tag("source", "Broad source")],
    ["target", tag("target", "Durable target")],
    ["daily", { ...tag("daily", "Daily"), parent: null }]
  ]);
  readonly transactions = new Map([
    ["tx-1", { id: "tx-1", changed: 20, tag: ["source"], deleted: false, state: null }]
  ]);
  readonly reminders = new Map([
    ["rem-1", { id: "rem-1", changed: 21, tag: ["source"], deleted: false, state: null }]
  ]);
  readonly markers = new Map([
    ["mark-1", { id: "mark-1", changed: 22, tag: ["source"], deleted: false, state: "planned" }]
  ]);
  budgets: Array<{ changed: number; user: number; date: string; tag: string }> = [];
  failTool: string | null = null;
  private changed = 100;

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    this.calls.push({ tool, input });
    if (this.failTool === tool) {
      this.failTool = null;
      throw new Error("injected consolidation failure");
    }
    switch (tool) {
      case "sync_status":
      case "sync_run":
        return { initialized: true };
      case "tags_list":
        return [...this.tags.values()];
      case "receipt_full_reference_snapshot":
        return {
          transactions: [...this.transactions.values()],
          reminders: [...this.reminders.values()],
          reminderMarkers: [...this.markers.values()],
          budgets: this.budgets
        };
      case "transactions_update":
        return this.updateReference(this.transactions, input);
      case "reminders_update":
        return this.updateReference(this.reminders, input);
      case "reminder_markers_update":
        return this.updateReference(this.markers, input);
      case "tags_update": {
        const id = String(input.id);
        const current = this.tags.get(id);
        if (!current || current.changed !== input.expectedChanged) throw new Error("stale category");
        const changed = ++this.changed;
        this.tags.set(id, { ...current, ...(input.patch as Record<string, unknown>), changed });
        return { status: "applied", id, sentChanged: changed };
      }
      default:
        throw new Error(`unexpected tool: ${tool}`);
    }
  }

  async close(): Promise<void> {}

  private updateReference(
    values: Map<string, { id: string; changed: number; tag: string[]; deleted: boolean; state: string | null }>,
    input: JsonObject
  ) {
    const id = String(input.id);
    const current = values.get(id);
    if (!current || current.changed !== input.expectedChanged) throw new Error("stale reference");
    const changed = ++this.changed;
    values.set(id, { ...current, ...(input.patch as { tag: string[] }), changed });
    return { status: "applied", id, sentChanged: changed };
  }
}

function writeCalls(backend: ConsolidationBackend) {
  return backend.calls.filter((call) => /_update$/.test(call.tool));
}

describe("category consolidation", () => {
  it("previews every supported reference, applies them, retires the source, and replays idempotently", async () => {
    const backend = new ConsolidationBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewCategoryConsolidation({
      sourceCategoryId: "source",
      targetCategoryId: "target"
    });
    expect(preview).toMatchObject({
      applyAvailable: true,
      affected: { transactions: 1, reminders: 1, reminderMarkers: 1, budgets: 0 },
      requiresConfirmation: true
    });
    expect(writeCalls(backend)).toHaveLength(0);
    if (!("previewToken" in preview)) throw new Error("fixture preview was unexpectedly blocked");

    const applied = await service.applyCategoryConsolidation({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(applied).toMatchObject({ applied: true, verified: true, affected: { transactions: 1, reminders: 1 } });
    expect(backend.transactions.get("tx-1")?.tag).toEqual(["target"]);
    expect(backend.reminders.get("rem-1")?.tag).toEqual(["target"]);
    expect(backend.markers.get("mark-1")?.tag).toEqual(["target"]);
    expect(backend.tags.get("source")).toMatchObject({ showOutcome: false, budgetOutcome: false });
    expect(
      await new ZenMoneyReceiptService(backend).inspectOperationRecovery(applied.operationId)
    ).toMatchObject({ classification: "completed", kind: "category-consolidation" });
    const writes = writeCalls(backend).length;
    expect(
      await service.applyCategoryConsolidation({ previewToken: preview.previewToken, confirmed: true })
    ).toMatchObject({ applied: false, alreadyApplied: true, verified: true });
    expect(writeCalls(backend)).toHaveLength(writes);
  });

  it("refuses a partial plan when a source budget exists", async () => {
    const backend = new ConsolidationBackend();
    backend.budgets = [{ changed: 5, user: 1, date: "2026-08-01", tag: "source" }];
    const preview = await new ZenMoneyReceiptService(backend).previewCategoryConsolidation({
      sourceCategoryId: "source",
      targetCategoryId: "target"
    });
    expect(preview).toMatchObject({
      applyAvailable: false,
      affected: { budgets: 1 },
      requiresConfirmation: false
    });
    expect(preview).not.toHaveProperty("previewToken");
    expect(writeCalls(backend)).toHaveLength(0);
  });

  it("rejects new references after preview and compensates an injected mid-apply failure", async () => {
    const staleBackend = new ConsolidationBackend();
    const staleService = new ZenMoneyReceiptService(staleBackend);
    const stalePreview = await staleService.previewCategoryConsolidation({
      sourceCategoryId: "source",
      targetCategoryId: "target"
    });
    if (!("previewToken" in stalePreview)) throw new Error("fixture preview was unexpectedly blocked");
    staleBackend.transactions.set("tx-new", {
      id: "tx-new",
      changed: 30,
      tag: ["source"],
      deleted: false,
      state: null
    });
    await expect(
      staleService.applyCategoryConsolidation({ previewToken: stalePreview.previewToken, confirmed: true })
    ).rejects.toThrow("references changed");
    expect(writeCalls(staleBackend)).toHaveLength(0);

    const failedBackend = new ConsolidationBackend();
    const failedService = new ZenMoneyReceiptService(failedBackend);
    const failedPreview = await failedService.previewCategoryConsolidation({
      sourceCategoryId: "source",
      targetCategoryId: "target"
    });
    if (!("previewToken" in failedPreview)) throw new Error("fixture preview was unexpectedly blocked");
    failedBackend.failTool = "reminders_update";
    await expect(
      failedService.applyCategoryConsolidation({ previewToken: failedPreview.previewToken, confirmed: true })
    ).rejects.toThrow("compensating rollback completed");
    expect(failedBackend.transactions.get("tx-1")?.tag).toEqual(["source"]);
    expect(failedBackend.tags.get("source")).toMatchObject({ showOutcome: true, budgetOutcome: true });
  });
});
