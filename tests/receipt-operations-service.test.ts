import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ZenMoneyReceiptService } from "../src/service.js";
import { localCalendarDate } from "../src/receipt-defaults.js";
import { ReceiptMemoryController } from "../src/receipt-memory.js";
import { ReceiptMemoryStore } from "../src/receipt-memory-store.js";
import type { Backend, JsonObject } from "../src/types.js";

class ReceiptBackend implements Backend {
  readonly calls: Array<{ tool: string; input: JsonObject }> = [];
  readonly transactions = new Map<string, Record<string, unknown>>();
  failCreateAt: number | null = null;
  private createCount = 0;
  private changed = 100;

  readonly account = {
    id: "account-1",
    title: "Test account",
    type: "checking",
    instrument: 2,
    archive: false
  };
  readonly accounts = [this.account];
  readonly tags = [
    { id: "food", title: "Food", parent: "daily", archive: false },
    { id: "kids", title: "Kids", parent: "family", archive: false }
  ];

  constructor() {
    this.transactions.set("source-1", {
      id: "source-1",
      changed: 10,
      date: "2026-08-15",
      incomeAccount: "account-1",
      outcomeAccount: "account-1",
      incomeInstrument: 2,
      outcomeInstrument: 2,
      income: 0,
      outcome: 6,
      opOutcome: null,
      opOutcomeInstrument: null,
      tag: ["food"],
      merchant: null,
      payee: "Synthetic market",
      comment: "fixture",
      hold: null,
      deleted: false
    });
  }

  async call(tool: string, input: JsonObject = {}): Promise<unknown> {
    this.calls.push({ tool, input });
    switch (tool) {
      case "sync_status":
        return { initialized: true };
      case "sync_run":
        return { initialized: true };
      case "accounts_list":
        return this.accounts;
      case "tags_list":
        return this.tags;
      case "transactions_list":
        return [...this.transactions.values()];
      case "transactions_get":
        return this.transactions.get(String(input.id)) ?? null;
      case "transactions_update": {
        const id = String(input.id);
        const current = this.transactions.get(id);
        if (!current) throw new Error("missing transaction");
        if (current.changed !== input.expectedChanged) throw new Error("stale fixture write");
        const changed = ++this.changed;
        this.transactions.set(id, {
          ...current,
          ...(input.patch as Record<string, unknown>),
          changed
        });
        return { status: "applied", id, sentChanged: changed };
      }
      case "receipt_transactions_create": {
        this.createCount += 1;
        if (this.failCreateAt === this.createCount) throw new Error("injected create failure");
        const id = String(input.id);
        const changed = ++this.changed;
        this.transactions.set(id, {
          id,
          changed,
          date: input.date,
          incomeAccount: input.accountId,
          outcomeAccount: input.accountId,
          incomeInstrument: input.instrument,
          outcomeInstrument: input.instrument,
          income: 0,
          outcome: input.amount,
          opOutcome: null,
          opOutcomeInstrument: null,
          tag: input.tagIds,
          merchant: input.merchant,
          payee: input.payee,
          comment: input.comment,
          hold: null,
          deleted: false
        });
        return { status: "applied", id, sentChanged: changed };
      }
      case "transactions_delete": {
        const id = String(input.id);
        const current = this.transactions.get(id);
        if (!current) throw new Error("missing transaction");
        if (current.changed !== input.expectedChanged) throw new Error("stale fixture delete");
        const changed = ++this.changed;
        this.transactions.set(id, { ...current, changed, deleted: true });
        return { status: "applied", id, sentChanged: changed };
      }
      default:
        throw new Error(`unexpected tool: ${tool}`);
    }
  }

  async close(): Promise<void> {}
}

function writes(backend: ReceiptBackend) {
  return backend.calls.filter((call) =>
    ["transactions_update", "receipt_transactions_create", "transactions_delete"].includes(call.tool)
  );
}

afterEach(() => vi.useRealTimers());

describe("receipt reconciliation", () => {
  it("previews without writes, then corrects the total, creates a split, and is idempotent", async () => {
    const backend = new ReceiptBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewReceiptReconciliation({
      receiptTotal: 5,
      allocations: [
        {
          transactionId: "source-1",
          parts: [
            { amount: 2, tagIds: ["food"] },
            { amount: 3, tagIds: ["kids"] }
          ]
        }
      ]
    });

    expect(writes(backend)).toHaveLength(0);
    expect(preview).toMatchObject({
      sourceTotal: 6,
      allocatedTotal: 5,
      totalCorrection: -1,
      requiresConfirmation: true
    });

    const applied = await service.applyReceiptReconciliation({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(applied).toMatchObject({ applied: true, verified: true, receiptTotal: 5 });
    expect(applied.transactions.map((transaction) => [transaction.outcome, transaction.tag])).toEqual([
      [2, ["food"]],
      [3, ["kids"]]
    ]);
    const writeCount = writes(backend).length;

    const repeated = await service.applyReceiptReconciliation({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(repeated).toMatchObject({ applied: false, alreadyApplied: true, verified: true });
    expect(writes(backend)).toHaveLength(writeCount);
  });

  it("rolls back its acknowledged update and created split when a later create fails", async () => {
    const backend = new ReceiptBackend();
    backend.failCreateAt = 2;
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewReceiptReconciliation({
      receiptTotal: 5,
      allocations: [
        {
          transactionId: "source-1",
          parts: [
            { amount: 2, tagIds: ["kids"] },
            { amount: 2, tagIds: ["food"] },
            { amount: 1, tagIds: ["kids"] }
          ]
        }
      ]
    });

    await expect(
      service.applyReceiptReconciliation({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("compensating rollback completed");
    expect(backend.transactions.get("source-1")).toMatchObject({ outcome: 6, tag: ["food"] });
    expect(
      [...backend.transactions.values()].filter(
        (transaction) => transaction.id !== "source-1" && transaction.deleted !== true
      )
    ).toHaveLength(0);
  });

  it("does not overwrite a source that changed after preview", async () => {
    const backend = new ReceiptBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewReceiptReconciliation({
      receiptTotal: 5,
      allocations: [
        { transactionId: "source-1", parts: [{ amount: 5, tagIds: ["food"] }] }
      ]
    });
    backend.transactions.set("source-1", {
      ...backend.transactions.get("source-1")!,
      changed: 11,
      outcome: 7
    });

    await expect(
      service.applyReceiptReconciliation({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("changed after preview");
    expect(backend.transactions.get("source-1")).toMatchObject({ changed: 11, outcome: 7 });
    expect(writes(backend)).toHaveLength(0);
  });
});

describe("new receipt creation", () => {
  it("records narrow evidence only after verified apply and exposes review readiness", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zenmoney-service-memory-"));
    try {
      const backend = new ReceiptBackend();
      const memory = new ReceiptMemoryController(new ReceiptMemoryStore(directory));
      const settings = await memory.previewSettings({ enabled: true });
      await memory.applySettings({ previewToken: settings.previewToken, confirmed: true });
      const service = new ZenMoneyReceiptService(
        backend,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        memory
      );

      const preview = await service.previewNewReceipt({
        receiptTotal: 6,
        accountId: "account-1",
        date: "2026-08-16",
        parts: [{ amount: 6, tagIds: ["food"] }],
        evidenceGroups: [
          { purpose: "Fresh fruit", categoryId: "food", itemCount: 2, amount: 6 }
        ]
      });

      expect(preview.receiptMemory).toMatchObject({
        enabled: true,
        willRecordEvidence: true,
        willEvaluateReviewReadiness: true,
        evidenceGroups: [{ purpose: "Fresh fruit", categoryId: "food" }]
      });
      expect((await memory.status()).storedRecordCount).toBe(0);
      const applied = await service.applyNewReceipt({
        previewToken: preview.previewToken,
        confirmed: true
      });
      expect(applied.receiptMemory).toMatchObject({
        status: "recorded",
        reviewReadiness: { ready: false, threshold: { distinctReceiptsPerPurpose: 3 } }
      });
      expect((await memory.status()).storedRecordCount).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects broad Produce evidence before any backend read", async () => {
    const backend = new ReceiptBackend();
    const service = new ZenMoneyReceiptService(backend);

    await expect(
      service.previewNewReceipt({
        receiptTotal: 6,
        accountId: "account-1",
        date: "2026-08-16",
        parts: [{ amount: 6, tagIds: ["food"] }],
        evidenceGroups: [{ purpose: "Produce", categoryId: "food", itemCount: 2, amount: 6 }]
      })
    ).rejects.toThrow("too broad");
    expect(backend.calls).toHaveLength(0);
  });

  it("suggests omitted fields and binds them to the confirmed create", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 12, 0));
    const backend = new ReceiptBackend();
    backend.accounts.push({
      id: "cash-wallet",
      title: "Cash Wallet",
      type: "cash",
      instrument: 2,
      archive: false
    });
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewNewReceipt({
      receiptTotal: 6,
      accountHint: "cash",
      payee: "Synthetic market",
      parts: [{ amount: 6, tagIds: ["food"] }]
    });

    expect(preview).toMatchObject({
      account: { id: "cash-wallet", title: "Cash Wallet" },
      date: localCalendarDate(),
      suggestedFields: [
        {
          field: "date",
          suggested: true,
          basis: "host-local-today",
          confidence: "medium"
        },
        {
          field: "accountId",
          value: "cash-wallet",
          label: "Cash Wallet",
          suggested: true,
          basis: "account-hint",
          confidence: "high"
        }
      ],
      requiresConfirmation: true
    });
    expect(writes(backend)).toHaveLength(0);

    const applied = await service.applyNewReceipt({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(applied).toMatchObject({ applied: true, verified: true });
    expect(applied.transactions).toEqual([
      expect.objectContaining({
        date: localCalendarDate(),
        outcomeAccount: "cash-wallet",
        outcome: 6,
        tag: ["food"]
      })
    ]);
  });

  it("uses bounded payee history when no account or payment hint is supplied", async () => {
    const backend = new ReceiptBackend();
    backend.accounts.push({
      id: "account-2",
      title: "Daily card",
      type: "checking",
      instrument: 2,
      archive: false
    });
    backend.transactions.set("history-2", {
      ...backend.transactions.get("source-1")!,
      id: "history-2",
      outcomeAccount: "account-2",
      incomeAccount: "account-2",
      payee: "Corner Grocer",
      date: "2026-08-16"
    });
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewNewReceipt({
      receiptTotal: 6,
      date: "2026-08-16",
      payee: "Corner Grocer",
      parts: [{ amount: 6, tagIds: ["food"] }]
    });

    expect(preview.account.id).toBe("account-2");
    expect(preview.suggestedFields).toEqual([
      expect.objectContaining({
        field: "accountId",
        value: "account-2",
        basis: "payee-history",
        suggested: true
      })
    ]);
    expect(writes(backend)).toHaveLength(0);
  });

  it("rejects conflicting exact and semantic account inputs before any backend read", async () => {
    const backend = new ReceiptBackend();
    const service = new ZenMoneyReceiptService(backend);

    await expect(
      service.previewNewReceipt({
        receiptTotal: 6,
        accountId: "account-1",
        accountHint: "cash",
        date: "2026-08-16",
        parts: [{ amount: 6, tagIds: ["food"] }]
      })
    ).rejects.toThrow("accountHint must be omitted");
    expect(backend.calls).toHaveLength(0);
  });

  it("creates exact allocated parts, verifies the total, and is idempotent", async () => {
    const backend = new ReceiptBackend();
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewNewReceipt({
      receiptTotal: 9,
      accountId: "account-1",
      date: "2026-08-15",
      payee: "Synthetic receipt",
      comment: "created by test",
      parts: [
        { amount: 4, tagIds: ["food"] },
        { amount: 5, tagIds: ["kids"] }
      ]
    });

    expect(writes(backend)).toHaveLength(0);
    expect(preview.suggestedFields).toEqual([]);
    const applied = await service.applyNewReceipt({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(applied).toMatchObject({ applied: true, verified: true, receiptTotal: 9 });
    expect(applied.transactions.map((transaction) => transaction.outcome)).toEqual([4, 5]);
    const writeCount = writes(backend).length;

    const repeated = await service.applyNewReceipt({
      previewToken: preview.previewToken,
      confirmed: true
    });
    expect(repeated).toMatchObject({ applied: false, alreadyApplied: true, verified: true });
    expect(writes(backend)).toHaveLength(writeCount);
  });

  it("deletes every acknowledged part when a later create fails", async () => {
    const backend = new ReceiptBackend();
    backend.failCreateAt = 2;
    const service = new ZenMoneyReceiptService(backend);
    const preview = await service.previewNewReceipt({
      receiptTotal: 9,
      accountId: "account-1",
      date: "2026-08-15",
      parts: [
        { amount: 4, tagIds: ["food"] },
        { amount: 5, tagIds: ["kids"] }
      ]
    });

    await expect(
      service.applyNewReceipt({ previewToken: preview.previewToken, confirmed: true })
    ).rejects.toThrow("compensating rollback completed");
    expect(
      [...backend.transactions.values()].filter(
        (transaction) => transaction.id !== "source-1" && transaction.deleted !== true
      )
    ).toHaveLength(0);
  });
});
