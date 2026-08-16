import { describe, expect, it, vi } from "vitest";

import { PreviewTokenManager } from "../src/preview-token.js";
import { ZenMoneyReceiptService } from "../src/service.js";
import type { Backend, JsonObject } from "../src/types.js";

class FakeBackend implements Backend {
  readonly calls: Array<{ tool: string; input: JsonObject }> = [];
  transaction: Record<string, unknown> = {
    id: "tx-1",
    changed: 10,
    date: "2026-08-14",
    outcomeAccount: "account-1",
    outcomeInstrument: 2,
    outcome: 25,
    income: 0,
    tag: ["old"],
    payee: "Market",
    deleted: false
  };
  tags = [
    { id: "old", title: "Other", parent: null, archive: false },
    { id: "food", title: "Groceries", parent: "everyday", archive: false }
  ];

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    this.calls.push({ tool, input });
    switch (tool) {
      case "sync_status":
        return { initialized: true };
      case "sync_run":
        return { initialized: true };
      case "transactions_get":
        return { ...this.transaction };
      case "tags_list":
        return this.tags;
      case "transactions_list":
        return [{ ...this.transaction }];
      case "transactions_update": {
        const patch = input.patch as Record<string, unknown>;
        this.transaction = { ...this.transaction, ...patch, changed: 11 };
        return { updated: true };
      }
      default:
        throw new Error(`unexpected tool: ${tool}`);
    }
  }

  async close(): Promise<void> {}
}

function service(backend: FakeBackend) {
  return new ZenMoneyReceiptService(backend, new PreviewTokenManager(Buffer.alloc(32, 9)));
}

describe("receipt category write flow", () => {
  it("previews without writing, then applies only the exact category patch and verifies", async () => {
    const backend = new FakeBackend();
    const subject = service(backend);

    const preview = await subject.previewCategory({ transactionId: "tx-1", tagIds: ["food"] });
    expect(backend.calls.some((call) => call.tool === "transactions_update")).toBe(false);
    expect(preview.proposed.categories).toEqual(["Groceries"]);

    const result = await subject.applyCategory({ previewToken: preview.previewToken, confirmed: true });
    const writes = backend.calls.filter((call) => call.tool === "transactions_update");
    expect(writes).toEqual([
      {
        tool: "transactions_update",
        input: { id: "tx-1", expectedChanged: 10, patch: { tag: ["food"] } }
      }
    ]);
    expect(result).toMatchObject({ applied: true, verified: true });
  });

  it("rejects a stale preview before writing", async () => {
    const backend = new FakeBackend();
    const subject = service(backend);
    const preview = await subject.previewCategory({ transactionId: "tx-1", tagIds: ["food"] });
    backend.transaction.changed = 12;

    await expect(
      subject.applyCategory({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("changed after preview");
    expect(backend.calls.some((call) => call.tool === "transactions_update")).toBe(false);
  });
});

describe("receipt matching defaults", () => {
  it("marks host-local today as a suggestion when the receipt date is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0));
    try {
      const result = await service(new FakeBackend()).matchReceipt({
        total: 25,
        merchant: "Market"
      });

      expect(result).toMatchObject({
        searchDate: "2026-08-14",
        suggestedFields: [
          {
            field: "date",
            value: "2026-08-14",
            suggested: true,
            basis: "host-local-today"
          }
        ],
        ambiguous: false
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("category summary", () => {
  it("keeps totals in different instruments separate", async () => {
    const backend = new FakeBackend();
    const originalCall = backend.call.bind(backend);
    backend.call = vi.fn(async (tool: string, input: JsonObject = {}) => {
      if (tool === "transactions_list") {
        return [
          { ...backend.transaction, id: "eur", outcomeInstrument: 2, outcome: 10, tag: ["food"] },
          { ...backend.transaction, id: "usd", outcomeInstrument: 1, outcome: 20, tag: ["food"] }
        ];
      }
      return originalCall(tool, input);
    });

    const result = await service(backend).categorySummary({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31"
    });

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => [group.instrument, group.total])).toEqual([
      [1, 20],
      [2, 10]
    ]);
  });

  it("builds bounded per-instrument evidence for saving suggestions", async () => {
    const backend = new FakeBackend();
    const originalCall = backend.call.bind(backend);
    backend.call = vi.fn(async (tool: string, input: JsonObject = {}) => {
      if (tool === "transactions_list") {
        return [
          { ...backend.transaction, id: "jan-food", date: "2026-01-12", outcome: 10, outcomeInstrument: 2, payee: "Cafe", tag: ["food"] },
          { ...backend.transaction, id: "feb-food", date: "2026-02-12", outcome: 20, outcomeInstrument: 2, payee: "Cafe", tag: ["food"] },
          { ...backend.transaction, id: "usd-food", date: "2026-02-14", outcome: 40, outcomeInstrument: 1, payee: "Cafe", tag: ["food"] }
        ];
      }
      return originalCall(tool, input);
    });

    const result = await service(backend).spendingInsights({
      dateFrom: "2026-01-01",
      dateTo: "2026-02-28"
    });

    expect(result.instruments.map((instrument) => [instrument.instrument, instrument.total])).toEqual([
      [1, 40],
      [2, 30]
    ]);
    expect(result.instruments[1]?.averagePerActiveMonth).toBe(15);
    expect(result.instruments[1]?.recurringPayeeCandidates).toEqual([
      { payee: "Cafe", total: 30, transactionCount: 2, activeMonths: 2 }
    ]);
    expect(result.evidenceBoundary).toContain("not guaranteed savings");
  });
});
