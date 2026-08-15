import { credentialStatus } from "./credentials.js";
import { PreviewTokenManager } from "./preview-token.js";
import { projectAccounts, projectTags, projectTransaction, projectTransactions } from "./projection.js";
import { rankReceiptMatches, shiftDate } from "./receipt.js";
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
    private readonly previews = new PreviewTokenManager()
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
    const byId = new Map(categories.map((category) => [category.id, category]));
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
