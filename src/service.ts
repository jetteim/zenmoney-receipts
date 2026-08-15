import { randomUUID } from "node:crypto";

import { credentialStatus } from "./credentials.js";
import { OperationPreviewStore } from "./operation-preview-store.js";
import { PreviewTokenManager } from "./preview-token.js";
import { projectAccounts, projectTags, projectTransaction, projectTransactions } from "./projection.js";
import { rankReceiptMatches, shiftDate } from "./receipt.js";
import {
  cents,
  sameAmount,
  sameTags,
  type NewReceiptPlan,
  type ReceiptOperationResult,
  type ReceiptPart,
  type ReconciliationPlan
} from "./receipt-operations.js";
import type { Backend, JsonObject, ReceiptFacts, ZenTag, ZenTransaction } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireTransaction(value: unknown): ZenTransaction {
  const transaction = projectTransaction(value);
  if (!transaction || transaction.deleted) {
    throw new Error("transaction was not found or is deleted");
  }
  return transaction;
}

export class ZenMoneyReceiptService {
  constructor(
    private readonly backend: Backend,
    private readonly previews = new PreviewTokenManager(),
    private readonly reconciliationPreviews = new OperationPreviewStore<
      ReconciliationPlan,
      ReceiptOperationResult
    >(),
    private readonly creationPreviews = new OperationPreviewStore<
      NewReceiptPlan,
      ReceiptOperationResult
    >()
  ) {}

  status(): { configured: boolean; credentialSource: string; privacy: string } {
    const status = credentialStatus();
    return {
      configured: status.configured,
      credentialSource: status.source,
      privacy: "Token and ZenMoney responses are kept in process memory; receipt files are not sent to this server."
    };
  }

  async sync(full = false): Promise<Record<string, unknown>> {
    return asRecord(await this.backend.call("sync_run", { full }));
  }

  private async ensureInitialized(): Promise<void> {
    const status = asRecord(await this.backend.call("sync_status"));
    if (status.initialized !== true) {
      await this.sync(true);
    }
  }

  async listAccounts(includeArchived = false) {
    await this.ensureInitialized();
    return projectAccounts(await this.backend.call("accounts_list", { includeArchived }));
  }

  async listCategories(includeArchived = false) {
    await this.ensureInitialized();
    return projectTags(await this.backend.call("tags_list", { includeArchived }));
  }

  async listTransactions(input: {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    accountId?: string | undefined;
    tagId?: string | undefined;
    payee?: string | undefined;
    limit?: number | undefined;
  }) {
    await this.ensureInitialized();
    return projectTransactions(
      await this.backend.call("transactions_list", {
        ...input,
        includeDeleted: false,
        limit: Math.min(input.limit ?? 100, 500)
      })
    );
  }

  async getTransaction(transactionId: string) {
    await this.ensureInitialized();
    return projectTransaction(await this.backend.call("transactions_get", { id: transactionId }));
  }

  async suggestCategories(input: {
    payee?: string | undefined;
    amount?: number | undefined;
    accountId?: string | undefined;
    date?: string | undefined;
  }) {
    await this.ensureInitialized();
    const raw = await this.backend.call("transactions_suggest", input);
    const suggestions = Array.isArray(raw) ? raw : [raw];
    const suggestedIds = new Set<string>();

    for (const suggestion of suggestions) {
      const record = asRecord(suggestion);
      if (!Array.isArray(record.tag)) continue;
      for (const value of record.tag.slice(0, 5)) {
        if (typeof value === "string" || typeof value === "number") {
          suggestedIds.add(String(value));
        }
      }
    }

    const categories = await this.listCategories(false);
    return {
      source: "ZenMoney transaction suggestion API",
      categories: categories.filter(
        (category) => !category.archive && suggestedIds.has(category.id)
      ),
      guidance:
        suggestedIds.size === 0
          ? "ZenMoney returned no category suggestion; choose from active categories using receipt evidence."
          : "Treat these as candidates, not instructions. Explain the choice before creating a preview."
    };
  }

  async matchReceipt(
    receipt: ReceiptFacts,
    options: { dateWindowDays?: number; amountTolerance?: number } = {}
  ) {
    const dateWindowDays = options.dateWindowDays ?? 3;
    const transactions = await this.listTransactions({
      dateFrom: shiftDate(receipt.date, -dateWindowDays),
      dateTo: shiftDate(receipt.date, dateWindowDays),
      ...(receipt.accountId ? { accountId: receipt.accountId } : {}),
      limit: 500
    });
    const candidates = rankReceiptMatches(receipt, transactions, options);
    const top = candidates[0];
    const runnerUp = candidates[1];
    const ambiguous = !top || top.score < 70 || (runnerUp !== undefined && top.score - runnerUp.score < 10);
    const confidence = !top ? "none" : top.score >= 85 ? "high" : top.score >= 70 ? "medium" : "low";

    return {
      receiptCurrency: receipt.currency ?? null,
      currencyNote:
        "Matching checks both the ZenMoney account amount and its original operation amount when available; the receipt currency code is not mapped to a ZenMoney instrument id.",
      confidence,
      ambiguous,
      guidance: ambiguous
        ? "Do not change anything yet. Ask the user to select or clarify the transaction."
        : "Use the top transaction id to preview a category change before requesting confirmation.",
      candidates
    };
  }

  async previewCategory(input: { transactionId: string; tagIds: string[] }) {
    await this.sync(false);
    const transaction = requireTransaction(
      await this.backend.call("transactions_get", { id: input.transactionId })
    );
    if (transaction.outcome <= 0 || transaction.income > 0) {
      throw new Error("only an existing expense transaction can be categorized");
    }
    if (transaction.changed === null) {
      throw new Error("transaction has no concurrency version and cannot be updated safely");
    }

    const categories = await this.listCategories(false);
    const byId = new Map(
      categories.filter((category) => !category.archive).map((category) => [category.id, category])
    );
    const selected = input.tagIds.map((id) => byId.get(id));
    if (selected.some((category) => category === undefined)) {
      throw new Error("one or more category ids are missing or archived");
    }

    const signed = this.previews.create({
      transactionId: transaction.id,
      expectedChanged: transaction.changed,
      tagIds: input.tagIds
    });
    return {
      operation: "replace transaction categories",
      before: { transaction, categories: categoryNames(transaction.tag, categories) },
      proposed: { tagIds: input.tagIds, categories: selected.map((category) => category!.title) },
      previewToken: signed.token,
      expiresAt: signed.expiresAt,
      requiresConfirmation: true,
      note: "No data has been changed. The token is bound to this exact transaction version and category list."
    };
  }

  async applyCategory(input: { previewToken: string; confirmed: true }) {
    if (input.confirmed !== true) {
      throw new Error("confirmed must be true after the user explicitly accepts the preview");
    }
    const preview = this.previews.verify(input.previewToken);
    await this.sync(false);
    const current = requireTransaction(
      await this.backend.call("transactions_get", { id: preview.transactionId })
    );

    if (sameIds(current.tag, preview.tagIds)) {
      return { applied: false, alreadyApplied: true, verified: true, transaction: current };
    }
    if (current.changed !== preview.expectedChanged) {
      throw new Error("transaction changed after preview; review it and create a new preview");
    }

    await this.backend.call("transactions_update", {
      id: preview.transactionId,
      expectedChanged: preview.expectedChanged,
      patch: { tag: preview.tagIds }
    });
    await this.sync(false);
    const updated = requireTransaction(
      await this.backend.call("transactions_get", { id: preview.transactionId })
    );
    if (!sameIds(updated.tag, preview.tagIds)) {
      throw new Error("ZenMoney did not confirm the requested category change");
    }
    return { applied: true, alreadyApplied: false, verified: true, transaction: updated };
  }

  async previewReceiptReconciliation(input: {
    receiptTotal: number;
    allocations: Array<{ transactionId: string; parts: ReceiptPart[] }>;
  }) {
    validateMoney(input.receiptTotal, "receipt total");
    if (input.allocations.length === 0) {
      throw new Error("at least one existing expense allocation is required");
    }
    if (new Set(input.allocations.map((allocation) => allocation.transactionId)).size !== input.allocations.length) {
      throw new Error("each source transaction may appear only once");
    }
    const partCount = input.allocations.reduce((total, allocation) => total + allocation.parts.length, 0);
    if (partCount > 20) throw new Error("a reconciliation is limited to 20 allocated parts");

    await this.sync(false);
    const categories = await this.listCategories(false);
    const activeCategoryIds = new Set(
      categories.filter((category) => !category.archive).map((category) => category.id)
    );
    const allocations: ReconciliationPlan["allocations"] = [];

    for (const allocation of input.allocations) {
      const source = requireTransaction(
        await this.backend.call("transactions_get", { id: allocation.transactionId })
      );
      requireReconciliableExpense(source);
      validateParts(allocation.parts, activeCategoryIds);
      const changesAmount =
        allocation.parts.length > 1 || !sameAmount(allocation.parts[0]!.amount, source.outcome);
      if (
        changesAmount &&
        (source.opOutcome !== null || source.opOutcomeInstrument !== null)
      ) {
        throw new Error(
          `transaction ${source.id} has an original-operation amount; amount reconciliation is not supported for foreign-currency expenses`
        );
      }
      allocations.push({
        source,
        parts: allocation.parts.map((part, index) => ({
          ...part,
          transactionId: index === 0 ? source.id : randomUUID()
        }))
      });
    }

    if (new Set(allocations.map((allocation) => allocation.source.outcomeInstrument)).size !== 1) {
      throw new Error("all reconciled expenses must use the same ZenMoney instrument");
    }

    const sourceTotal = allocations.reduce((total, allocation) => total + cents(allocation.source.outcome), 0);
    const allocatedTotal = allocations.reduce(
      (total, allocation) =>
        total + allocation.parts.reduce((partTotal, part) => partTotal + cents(part.amount), 0),
      0
    );
    if (allocatedTotal !== cents(input.receiptTotal)) {
      throw new Error("allocated parts must sum exactly to the receipt total");
    }

    const plan: ReconciliationPlan = {
      receiptTotal: input.receiptTotal,
      sourceTotal: sourceTotal / 100,
      allocatedTotal: allocatedTotal / 100,
      allocations
    };
    const preview = this.reconciliationPreviews.create(plan);
    return {
      operation: "reconcile existing receipt expenses",
      receiptTotal: plan.receiptTotal,
      sourceTotal: plan.sourceTotal,
      allocatedTotal: plan.allocatedTotal,
      totalCorrection: (allocatedTotal - sourceTotal) / 100,
      changes: allocations.map((allocation) => ({
        before: allocation.source,
        parts: allocation.parts.map((part, index) => ({
          transactionId: part.transactionId,
          disposition: index === 0 ? "update existing transaction" : "create split transaction",
          amount: part.amount,
          tagIds: part.tagIds,
          categories: categoryNames(part.tagIds, categories)
        }))
      })),
      ...preview,
      requiresConfirmation: true,
      rollback:
        "If a multi-step apply fails, the connector attempts to delete created split parts and restore every source amount/category before reporting failure.",
      note: "No data has been changed."
    };
  }

  async previewNewReceipt(input: {
    receiptTotal: number;
    accountId: string;
    date: string;
    payee?: string | undefined;
    comment?: string | undefined;
    parts: ReceiptPart[];
  }) {
    validateMoney(input.receiptTotal, "receipt total");
    const [accounts, categories] = await Promise.all([
      this.listAccounts(false),
      this.listCategories(false)
    ]);
    const account = accounts.find((candidate) => candidate.id === input.accountId);
    if (!account || account.archive || account.instrument === null) {
      throw new Error("the selected account is missing, archived, or has no currency instrument");
    }
    const activeCategoryIds = new Set(
      categories.filter((category) => !category.archive).map((category) => category.id)
    );
    validateParts(input.parts, activeCategoryIds);
    if (input.parts.reduce((total, part) => total + cents(part.amount), 0) !== cents(input.receiptTotal)) {
      throw new Error("new expense parts must sum exactly to the receipt total");
    }

    const plan: NewReceiptPlan = {
      receiptTotal: input.receiptTotal,
      accountId: input.accountId,
      instrument: account.instrument,
      date: input.date,
      payee: input.payee?.trim() || null,
      comment: input.comment?.trim() || null,
      parts: input.parts.map((part) => ({ ...part, transactionId: randomUUID() }))
    };
    const preview = this.creationPreviews.create(plan);
    return {
      operation: plan.parts.length === 1 ? "create receipt expense" : "create allocated receipt expenses",
      account,
      receiptTotal: plan.receiptTotal,
      date: plan.date,
      payee: plan.payee,
      parts: plan.parts.map((part) => ({
        transactionId: part.transactionId,
        amount: part.amount,
        tagIds: part.tagIds,
        categories: categoryNames(part.tagIds, categories)
      })),
      ...preview,
      requiresConfirmation: true,
      rollback: "If one create fails, the connector attempts to delete every part created by this preview.",
      note: "No data has been changed."
    };
  }

  async applyReceiptReconciliation(input: { previewToken: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = this.reconciliationPreviews.begin(input.previewToken);
    if (started.state === "applied") {
      return { ...started.result, applied: false, alreadyApplied: true };
    }
    const plan = started.plan;
    const appliedSources: Array<{
      allocation: ReconciliationPlan["allocations"][number];
      appliedChanged: number | null;
    }> = [];
    const createdIds: string[] = [];
    const uncertainSourceIds: string[] = [];

    try {
      await this.sync(false);
      for (const allocation of plan.allocations) {
        const current = requireTransaction(
          await this.backend.call("transactions_get", { id: allocation.source.id })
        );
        if (current.changed !== allocation.source.changed) {
          throw new Error(`transaction ${current.id} changed after preview; create a new preview`);
        }
      }

      for (const allocation of plan.allocations) {
        const first = allocation.parts[0]!;
        if (
          !sameAmount(allocation.source.outcome, first.amount) ||
          !sameTags(allocation.source.tag, first.tagIds)
        ) {
          let applied: { id: string; changed: number | null };
          try {
            applied = requireAppliedWrite(
              await this.backend.call("transactions_update", {
                id: allocation.source.id,
                expectedChanged: allocation.source.changed,
                patch: { outcome: first.amount, tag: first.tagIds }
              })
            );
          } catch (error) {
            try {
              await this.sync(false);
              const observed = requireTransaction(
                await this.backend.call("transactions_get", { id: allocation.source.id })
              );
              if (
                sameAmount(observed.outcome, first.amount) &&
                sameTags(observed.tag, first.tagIds) &&
                observed.changed !== null
              ) {
                appliedSources.push({ allocation, appliedChanged: observed.changed });
              } else if (
                !sameAmount(observed.outcome, allocation.source.outcome) ||
                !sameTags(observed.tag, allocation.source.tag) ||
                observed.changed !== allocation.source.changed
              ) {
                uncertainSourceIds.push(allocation.source.id);
              }
            } catch {
              uncertainSourceIds.push(allocation.source.id);
            }
            throw error;
          }
          appliedSources.push({ allocation, appliedChanged: applied.changed });
          if (applied.changed === null) {
            throw new Error(`ZenMoney did not return a concurrency version for ${allocation.source.id}`);
          }
        }
        for (const part of allocation.parts.slice(1)) {
          const existing = projectTransaction(
            await this.backend.call("transactions_get", { id: part.transactionId })
          );
          if (existing && !existing.deleted) {
            throw new Error(`planned split transaction id ${part.transactionId} already exists`);
          }
          createdIds.push(part.transactionId);
          await this.createExpenseRecord({
            transactionId: part.transactionId,
            accountId: allocation.source.outcomeAccount!,
            instrument: allocation.source.outcomeInstrument!,
            amount: part.amount,
            date: allocation.source.date!,
            tagIds: part.tagIds,
            merchant: allocation.source.merchant,
            payee: allocation.source.payee,
            comment: allocation.source.comment
          });
        }
      }

      await this.sync(false);
      const transactions: ZenTransaction[] = [];
      for (const allocation of plan.allocations) {
        for (const part of allocation.parts) {
          const transaction = requireTransaction(
            await this.backend.call("transactions_get", { id: part.transactionId })
          );
          if (!sameAmount(transaction.outcome, part.amount) || !sameTags(transaction.tag, part.tagIds)) {
            throw new Error(`verification failed for reconciled transaction ${part.transactionId}`);
          }
          transactions.push(transaction);
        }
      }
      if (transactions.reduce((total, transaction) => total + cents(transaction.outcome), 0) !== cents(plan.receiptTotal)) {
        throw new Error("verified transactions do not sum to the receipt total");
      }

      const result: ReceiptOperationResult = {
        applied: true,
        alreadyApplied: false,
        verified: true,
        receiptTotal: plan.receiptTotal,
        transactionIds: transactions.map((transaction) => transaction.id),
        transactions
      };
      this.reconciliationPreviews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      const rollbackFailures = [
        ...(await this.rollbackReconciliation(appliedSources, createdIds)),
        ...uncertainSourceIds
      ];
      if (rollbackFailures.length > 0) {
        const message =
          "receipt reconciliation failed and compensating rollback was incomplete; inspect the previewed transaction ids manually";
        this.reconciliationPreviews.markFailed(input.previewToken, message);
        throw new Error(`${message} (${rollbackFailures.length} rollback errors)`);
      }
      this.reconciliationPreviews.reset(input.previewToken);
      const message = error instanceof Error ? error.message : "receipt reconciliation failed";
      throw new Error(`${message}; compensating rollback completed`);
    }
  }

  async applyNewReceipt(input: { previewToken: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = this.creationPreviews.begin(input.previewToken);
    if (started.state === "applied") {
      return { ...started.result, applied: false, alreadyApplied: true };
    }
    const plan = started.plan;
    const createdIds: string[] = [];

    try {
      const accounts = await this.listAccounts(false);
      const account = accounts.find((candidate) => candidate.id === plan.accountId);
      if (!account || account.archive || account.instrument !== plan.instrument) {
        throw new Error("the previewed account is no longer available");
      }
      for (const part of plan.parts) {
        const existing = projectTransaction(
          await this.backend.call("transactions_get", { id: part.transactionId })
        );
        if (existing && !existing.deleted) {
          throw new Error(`planned receipt transaction id ${part.transactionId} already exists`);
        }
        createdIds.push(part.transactionId);
        await this.createExpenseRecord({
          transactionId: part.transactionId,
          accountId: plan.accountId,
          instrument: account.instrument,
          amount: part.amount,
          date: plan.date,
          tagIds: part.tagIds,
          merchant: null,
          payee: plan.payee,
          comment: plan.comment
        });
      }

      await this.sync(false);
      const transactions: ZenTransaction[] = [];
      for (const part of plan.parts) {
        const transaction = requireTransaction(
          await this.backend.call("transactions_get", { id: part.transactionId })
        );
        if (!sameAmount(transaction.outcome, part.amount) || !sameTags(transaction.tag, part.tagIds)) {
          throw new Error(`verification failed for new receipt transaction ${part.transactionId}`);
        }
        transactions.push(transaction);
      }
      if (transactions.reduce((total, transaction) => total + cents(transaction.outcome), 0) !== cents(plan.receiptTotal)) {
        throw new Error("created transactions do not sum to the receipt total");
      }

      const result: ReceiptOperationResult = {
        applied: true,
        alreadyApplied: false,
        verified: true,
        receiptTotal: plan.receiptTotal,
        transactionIds: transactions.map((transaction) => transaction.id),
        transactions
      };
      this.creationPreviews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      const rollbackFailures = await this.rollbackCreated(createdIds);
      if (rollbackFailures.length > 0) {
        const message =
          "new receipt creation failed and compensating rollback was incomplete; inspect the previewed transaction ids manually";
        this.creationPreviews.markFailed(input.previewToken, message);
        throw new Error(`${message} (${rollbackFailures.length} rollback errors)`);
      }
      this.creationPreviews.reset(input.previewToken);
      const message = error instanceof Error ? error.message : "new receipt creation failed";
      throw new Error(`${message}; compensating rollback completed`);
    }
  }

  private async createExpenseRecord(input: {
    transactionId: string;
    accountId: string;
    instrument: number;
    amount: number;
    date: string;
    tagIds: string[];
    merchant: string | null;
    payee: string | null;
    comment: string | null;
  }): Promise<void> {
    requireAppliedWrite(
      await this.backend.call("receipt_transactions_create", {
        id: input.transactionId,
        instrument: input.instrument,
        accountId: input.accountId,
        amount: input.amount,
        tagIds: input.tagIds,
        merchant: input.merchant,
        payee: input.payee,
        comment: input.comment,
        date: input.date
      })
    );
  }

  private async rollbackCreated(transactionIds: string[]): Promise<string[]> {
    const failures: string[] = [];
    for (const transactionId of [...transactionIds].reverse()) {
      try {
        await this.sync(false);
        const current = projectTransaction(
          await this.backend.call("transactions_get", { id: transactionId })
        );
        if (!current || current.deleted) continue;
        if (current.changed === null) throw new Error("missing concurrency version");
        requireAppliedWrite(
          await this.backend.call("transactions_delete", {
            id: current.id,
            expectedChanged: current.changed
          })
        );
      } catch {
        failures.push(transactionId);
      }
    }
    try {
      await this.sync(false);
      for (const transactionId of transactionIds) {
        const current = projectTransaction(
          await this.backend.call("transactions_get", { id: transactionId })
        );
        if (current && !current.deleted) failures.push(transactionId);
      }
    } catch {
      failures.push(...transactionIds);
    }
    return [...new Set(failures)];
  }

  private async rollbackReconciliation(
    appliedSources: Array<{
      allocation: ReconciliationPlan["allocations"][number];
      appliedChanged: number | null;
    }>,
    createdIds: string[]
  ): Promise<string[]> {
    const failures = await this.rollbackCreated(createdIds);
    for (const appliedSource of [...appliedSources].reverse()) {
      const { allocation, appliedChanged } = appliedSource;
      try {
        await this.sync(false);
        const current = requireTransaction(
          await this.backend.call("transactions_get", { id: allocation.source.id })
        );
        if (
          sameAmount(current.outcome, allocation.source.outcome) &&
          sameTags(current.tag, allocation.source.tag)
        ) {
          continue;
        }
        if (current.changed !== appliedChanged) {
          throw new Error("source changed again after the connector update");
        }
        if (current.changed === null) throw new Error("missing concurrency version");
        requireAppliedWrite(
          await this.backend.call("transactions_update", {
            id: current.id,
            expectedChanged: current.changed,
            patch: { outcome: allocation.source.outcome, tag: allocation.source.tag }
          })
        );
      } catch {
        failures.push(allocation.source.id);
      }
    }
    try {
      await this.sync(false);
      for (const { allocation } of appliedSources) {
        const restored = requireTransaction(
          await this.backend.call("transactions_get", { id: allocation.source.id })
        );
        if (
          !sameAmount(restored.outcome, allocation.source.outcome) ||
          !sameTags(restored.tag, allocation.source.tag)
        ) {
          failures.push(allocation.source.id);
        }
      }
    } catch {
      failures.push(...appliedSources.map(({ allocation }) => allocation.source.id));
    }
    return [...new Set(failures)];
  }

  async categorySummary(input: { dateFrom: string; dateTo: string; limit?: number }) {
    const limit = Math.min(input.limit ?? 500, 500);
    const [transactions, categories] = await Promise.all([
      this.listTransactions({ dateFrom: input.dateFrom, dateTo: input.dateTo, limit }),
      this.listCategories(false)
    ]);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const buckets = new Map<
      string,
      {
        instrument: number | null;
        categoryId: string | null;
        category: string;
        total: number;
        transactionCount: number;
        samples: Array<{ id: string; date: string | null; payee: string | null; outcome: number }>;
      }
    >();

    for (const transaction of transactions) {
      if (transaction.deleted || transaction.outcome <= 0 || transaction.income > 0) continue;
      const categoryId = primaryCategory(transaction.tag, byId);
      const key = `${transaction.outcomeInstrument ?? "unknown"}:${categoryId ?? "uncategorized"}`;
      const bucket = buckets.get(key) ?? {
        instrument: transaction.outcomeInstrument,
        categoryId,
        category: categoryId ? byId.get(categoryId)?.title ?? "Unknown category" : "Uncategorized",
        total: 0,
        transactionCount: 0,
        samples: []
      };
      bucket.total += transaction.outcome;
      bucket.transactionCount += 1;
      if (bucket.samples.length < 3) {
        bucket.samples.push({
          id: transaction.id,
          date: transaction.date,
          payee: transaction.payee,
          outcome: transaction.outcome
        });
      }
      buckets.set(key, bucket);
    }

    return {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      transactionCountExamined: transactions.length,
      possiblyTruncated: transactions.length === limit,
      currencySafety: "Totals are separated by ZenMoney instrument id and must not be added across instruments.",
      groups: [...buckets.values()].sort(
        (left, right) =>
          String(left.instrument).localeCompare(String(right.instrument)) || right.total - left.total
      )
    };
  }

  async close(): Promise<void> {
    await this.backend.close();
  }
}

function primaryCategory(tagIds: string[], byId: Map<string, ZenTag>): string | null {
  return tagIds.find((id) => byId.get(id)?.parent !== null && byId.has(id)) ?? tagIds[0] ?? null;
}

function categoryNames(tagIds: string[], categories: ZenTag[]): string[] {
  const byId = new Map(categories.map((category) => [category.id, category.title]));
  return tagIds.map((id) => byId.get(id) ?? "Unknown category");
}

function validateMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) {
    throw new Error(`${label} must be a positive finite amount`);
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    throw new Error(`${label} must have at most two decimal places`);
  }
}

function validateParts(parts: ReceiptPart[], activeCategoryIds: Set<string>): void {
  if (parts.length === 0 || parts.length > 10) {
    throw new Error("each allocation must contain between 1 and 10 parts");
  }
  for (const [index, part] of parts.entries()) {
    validateMoney(part.amount, `part ${index + 1} amount`);
    if (part.tagIds.length === 0 || part.tagIds.length > 5) {
      throw new Error(`part ${index + 1} must have between 1 and 5 category ids`);
    }
    if (new Set(part.tagIds).size !== part.tagIds.length) {
      throw new Error(`part ${index + 1} category ids must be unique`);
    }
    if (part.tagIds.some((tagId) => !activeCategoryIds.has(tagId))) {
      throw new Error(`part ${index + 1} contains a missing or archived category id`);
    }
  }
}

function requireReconciliableExpense(transaction: ZenTransaction): void {
  if (transaction.outcome <= 0 || transaction.income > 0) {
    throw new Error(`transaction ${transaction.id} is not an expense`);
  }
  if (transaction.changed === null) {
    throw new Error(`transaction ${transaction.id} has no concurrency version`);
  }
  if (
    transaction.outcomeAccount === null ||
    transaction.outcomeInstrument === null ||
    transaction.date === null
  ) {
    throw new Error(`transaction ${transaction.id} lacks account, instrument, or date metadata`);
  }
  if (transaction.hold) {
    throw new Error(`transaction ${transaction.id} is pending; wait until it is posted`);
  }
}

function requireAppliedWrite(value: unknown): { id: string; changed: number | null } {
  const result = asRecord(value);
  if (result.status !== "applied") {
    const message = typeof result.message === "string" ? result.message : "ZenMoney write was not applied";
    throw new Error(message);
  }
  if (typeof result.id !== "string" || result.id.length === 0) {
    throw new Error("ZenMoney write response is missing the transaction id");
  }
  const changed =
    typeof result.snapshotChanged === "number"
      ? result.snapshotChanged
      : typeof result.sentChanged === "number"
        ? result.sentChanged
        : null;
  return { id: result.id, changed };
}
