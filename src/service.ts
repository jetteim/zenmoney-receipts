import { randomUUID } from "node:crypto";
import { decision, provenance } from "./provenance.js";

import { credentialStatus } from "./credentials.js";
import { OperationPreviewStore } from "./operation-preview-store.js";
import {
  OperationJournal,
  operationIdForPreviewToken,
  plannedTransactionFingerprint,
  transactionFingerprint,
  type JournalTarget
} from "./operation-journal.js";
import { PrivacySafeEventStore } from "./observability.js";
import { PreviewTokenManager } from "./preview-token.js";
import { projectAccounts, projectTags, projectTransaction, projectTransactions } from "./projection.js";
import { rankReceiptMatches, shiftDate } from "./receipt.js";
import { ReceiptMemoryController } from "./receipt-memory.js";
import {
  validateReceiptEvidenceGroups,
  type ReceiptEvidenceGroup
} from "./receipt-memory-store.js";
import {
  recommendReceiptAccount,
  resolveReceiptDate,
  validateAccountHint
} from "./receipt-defaults.js";
import {
  cents,
  sameAmount,
  sameTags,
  type NewReceiptPlan,
  type ReceiptMemoryResult,
  type ReceiptOperationResult,
  type ReceiptPart,
  type ReconciliationPlan
} from "./receipt-operations.js";
import {
  consolidationCategoryFingerprint,
  parseFullCategoryReferenceSnapshot,
  referenceFingerprint,
  referencesForConsolidation,
  type CategoryConsolidationPlan,
  type CategoryReference,
  type ConsolidationReferenceKind,
  type FullCategoryReferenceSnapshot
} from "./category-consolidation.js";
import {
  categoryMatchesFields,
  proposedCategory,
  type CategoryCreateFields,
  type CategoryCreatePlan,
  type CategoryMutationResult,
  type CategoryPatch,
  type CategoryUpdatePlan
} from "./taxonomy-operations.js";
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
    >(),
    private readonly categoryCreatePreviews = new OperationPreviewStore<
      CategoryCreatePlan,
      CategoryMutationResult
    >(),
    private readonly categoryUpdatePreviews = new OperationPreviewStore<
      CategoryUpdatePlan,
      CategoryMutationResult
    >(),
    private readonly categoryRetirePreviews = new OperationPreviewStore<
      CategoryUpdatePlan,
      CategoryMutationResult
    >(),
    private readonly receiptMemory = new ReceiptMemoryController(),
    private readonly operationJournal = new OperationJournal(),
    private readonly events = new PrivacySafeEventStore(),
    private readonly consolidationPreviews = new OperationPreviewStore<
      CategoryConsolidationPlan,
      {
        applied: boolean;
        alreadyApplied: boolean;
        verified: boolean;
        operationId: string;
        affected: { transactions: number; reminders: number; reminderMarkers: number };
        source: ZenTag;
      }
    >()
  ) {}

  status(): { configured: boolean; credentialSource: string; privacy: string } {
    const status = credentialStatus();
    return {
      configured: status.configured,
      credentialSource: status.source,
      privacy:
        "Credentials and ZenMoney responses stay in process memory. Receipt files are not sent here. The crash-recovery journal stores only target ids and one-way state fingerprints in a private local file."
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
    const categories = projectTags(
      await this.backend.call("tags_list", { includeArchived: true })
    );
    return includeArchived
      ? categories
      : categories.filter((category) => !category.archive && !category.retired);
  }

  private async listTaxonomyCategories(): Promise<ZenTag[]> {
    await this.ensureInitialized();
    const raw = await this.backend.call("tags_list", { includeArchived: true });
    if (!Array.isArray(raw)) throw new Error("category listing did not return an array");
    if (raw.length > 500) {
      throw new Error("taxonomy changes are disabled when the category set exceeds 500 records");
    }
    const categories = projectTags(raw);
    if (categories.length !== raw.length) {
      throw new Error("one or more categories lack a safe stable id");
    }
    return categories;
  }

  async previewCategoryCreate(input: {
    title: string;
    parentId?: string | null | undefined;
    showIncome: boolean;
    showOutcome: boolean;
    budgetIncome: boolean;
    budgetOutcome: boolean;
    required?: boolean | null | undefined;
  }) {
    await this.sync(false);
    const categories = await this.listTaxonomyCategories();
    const proposed: CategoryCreateFields = {
      title: normalizeCategoryTitle(input.title),
      parent: input.parentId ?? null,
      showIncome: input.showIncome,
      showOutcome: input.showOutcome,
      budgetIncome: input.budgetIncome,
      budgetOutcome: input.budgetOutcome,
      required: input.required ?? null
    };
    validateCategoryBehavior(proposed, false);
    const parent = validateCategoryParent(categories, null, proposed.parent);
    ensureUniqueSiblingTitle(categories, null, proposed.parent, proposed.title);

    const preview = this.categoryCreatePreviews.create({
      proposed,
      expectedParentChanged: parent?.changed ?? null
    });
    return {
      operation: "create ZenMoney category",
      proposed,
      parent: parent ? { id: parent.id, title: parent.title } : null,
      ...preview,
      requiresConfirmation: true,
      rollback: "If verification fails after creation, the connector will report the exact created id for manual review; it never exposes category deletion.",
      note: "No data has been changed. ZenMoney categories support one parent level only."
    };
  }

  async applyCategoryCreate(input: { previewToken: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = this.categoryCreatePreviews.begin(input.previewToken);
    if (started.state === "applied") {
      return { ...started.result, applied: false, alreadyApplied: true };
    }
    const plan = started.plan;

    try {
      await this.sync(false);
      const categories = await this.listTaxonomyCategories();
      const parent = validateCategoryParent(categories, null, plan.proposed.parent);
      if (parent && parent.changed !== plan.expectedParentChanged) {
        throw new Error("the parent category changed after preview; create a new preview");
      }
      ensureUniqueSiblingTitle(categories, null, plan.proposed.parent, plan.proposed.title);

      const applied = requireAppliedWrite(await this.backend.call("tags_create", { ...plan.proposed }));
      await this.sync(false);
      const created = (await this.listTaxonomyCategories()).find((category) => category.id === applied.id);
      if (!created || !categoryMatchesFields(created, plan.proposed)) {
        throw new Error(`ZenMoney did not confirm the created category ${applied.id}`);
      }

      const result: CategoryMutationResult = {
        applied: true,
        alreadyApplied: false,
        verified: true,
        operation: "create",
        category: created
      };
      this.categoryCreatePreviews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      this.categoryCreatePreviews.reset(input.previewToken);
      throw error;
    }
  }

  async previewCategoryUpdate(input: {
    categoryId: string;
    title?: string | undefined;
    parentId?: string | null | undefined;
    showIncome?: boolean | undefined;
    showOutcome?: boolean | undefined;
    budgetIncome?: boolean | undefined;
    budgetOutcome?: boolean | undefined;
    required?: boolean | null | undefined;
  }) {
    await this.sync(false);
    const categories = await this.listTaxonomyCategories();
    const category = requireCategory(categories, input.categoryId);
    const expectedChanged = requireCategoryChanged(category);
    const patch: CategoryPatch = {};
    if (input.title !== undefined) patch.title = normalizeCategoryTitle(input.title);
    if (Object.prototype.hasOwnProperty.call(input, "parentId")) patch.parent = input.parentId ?? null;
    if (input.showIncome !== undefined) patch.showIncome = input.showIncome;
    if (input.showOutcome !== undefined) patch.showOutcome = input.showOutcome;
    if (input.budgetIncome !== undefined) patch.budgetIncome = input.budgetIncome;
    if (input.budgetOutcome !== undefined) patch.budgetOutcome = input.budgetOutcome;
    if (Object.prototype.hasOwnProperty.call(input, "required")) patch.required = input.required ?? null;
    if (Object.keys(patch).length === 0) throw new Error("at least one category field must be changed");

    const proposed = proposedCategory(category, patch);
    if (proposed.retired && !category.retired) {
      throw new Error("use the category retirement preview to disable a category everywhere");
    }
    validateCategoryBehavior(proposed, category.retired);
    validateCategoryParent(categories, category.id, proposed.parent);
    if (proposed.parent !== category.parent && proposed.parent !== null) {
      const children = categories.filter((candidate) => candidate.parent === category.id);
      if (children.length > 0) {
        throw new Error("a category with children cannot become a child category");
      }
    }
    ensureUniqueSiblingTitle(categories, category.id, proposed.parent, proposed.title);
    if (categoryMatchesFields(category, patch)) throw new Error("the requested category update is a no-op");

    const preview = this.categoryUpdatePreviews.create({
      categoryId: category.id,
      expectedChanged,
      before: category,
      patch
    });
    return {
      operation: "update ZenMoney category",
      before: category,
      proposed,
      exactPatch: patch,
      ...preview,
      requiresConfirmation: true,
      note: "No data has been changed. Existing transaction references keep the same category id."
    };
  }

  async applyCategoryUpdate(input: { previewToken: string; confirmed: true }) {
    return this.applyCategoryUpdatePlan(
      this.categoryUpdatePreviews,
      input,
      "update"
    );
  }

  async previewCategoryRetirement(input: { categoryId: string }) {
    await this.sync(false);
    const categories = await this.listTaxonomyCategories();
    const category = requireCategory(categories, input.categoryId);
    const children = categories.filter((candidate) => candidate.parent === category.id && !candidate.retired);
    if (children.length > 0) {
      throw new Error("retire or move active child categories before retiring their parent");
    }
    const expectedChanged = requireCategoryChanged(category);
    const patch: CategoryPatch = {
      showIncome: false,
      showOutcome: false,
      budgetIncome: false,
      budgetOutcome: false
    };
    const preview = this.categoryRetirePreviews.create({
      categoryId: category.id,
      expectedChanged,
      before: category,
      patch
    });
    return {
      operation: "retire ZenMoney category",
      before: category,
      proposed: proposedCategory(category, patch),
      exactPatch: patch,
      historicalReferences: "preserved",
      ...preview,
      requiresConfirmation: true,
      note: category.retired
        ? "No data has been changed. The category is already retired; applying this preview is idempotent."
        : "No data has been changed. Retirement disables income, expense, and budget selection but does not delete or recategorize history."
    };
  }

  async applyCategoryRetirement(input: { previewToken: string; confirmed: true }) {
    return this.applyCategoryUpdatePlan(
      this.categoryRetirePreviews,
      input,
      "retire"
    );
  }

  async previewCategoryConsolidation(input: { sourceCategoryId: string; targetCategoryId: string }) {
    if (input.sourceCategoryId === input.targetCategoryId) {
      throw new Error("source and target categories must be different");
    }
    await this.sync(false);
    const categories = await this.listTaxonomyCategories();
    const source = requireCategory(categories, input.sourceCategoryId);
    const target = requireCategory(categories, input.targetCategoryId);
    if (source.retired) throw new Error("source category is already retired");
    if (target.retired || target.archive || !target.showOutcome) {
      throw new Error("target category must be an active expense category");
    }
    if (categories.some((category) => category.parent === source.id && !category.retired)) {
      throw new Error("move or consolidate active child categories before consolidating their parent");
    }
    const snapshot = await this.fullCategoryReferenceSnapshot();
    const references = referencesForConsolidation(snapshot, source.id, target.id);
    const sourceBudgetReferences = snapshot.budgets.filter((budget) => budget.tag === source.id).length;
    const counts = consolidationCounts(references);
    if (sourceBudgetReferences > 0) {
      return {
        operation: "consolidate ZenMoney category",
        applyAvailable: false,
        source,
        target,
        affected: { ...counts, budgets: sourceBudgetReferences },
        blockers: [
          "The source category has budget references. The pinned ZenMoney backend exposes budgets read-only and current authoritative budget delete/merge semantics are unavailable; no partial migration was previewed."
        ],
        requiresConfirmation: false,
        note: "No data has been changed. Move or clear the exact source budgets in ZenMoney, then create a fresh consolidation preview."
      };
    }
    if (references.length > 500) {
      return {
        operation: "consolidate ZenMoney category",
        applyAvailable: false,
        source,
        target,
        affected: { ...counts, budgets: 0 },
        blockers: ["The consolidation exceeds the 500-reference safety limit."],
        requiresConfirmation: false,
        note: "No data has been changed. Split the migration into a reviewed maintenance operation."
      };
    }
    const patch: CategoryPatch = {
      showIncome: false,
      showOutcome: false,
      budgetIncome: false,
      budgetOutcome: false
    };
    const plan: CategoryConsolidationPlan = {
      source,
      target,
      references,
      sourceBudgetReferences,
      sourceRetirement: {
        categoryId: source.id,
        expectedChanged: requireCategoryChanged(source),
        before: source,
        patch
      }
    };
    const preview = this.consolidationPreviews.create(plan, { ttlMs: 20 * 60_000 });
    return {
      operation: "consolidate ZenMoney category",
      applyAvailable: true,
      source,
      target,
      affected: { ...counts, budgets: 0 },
      exactChanges: references.map((reference) => ({
        kind: reference.kind,
        id: reference.id,
        beforeTagIds: reference.beforeTags,
        afterTagIds: reference.afterTags
      })),
      sourceAfter: proposedCategory(source, patch),
      ...preview,
      operationId: operationIdForPreviewToken(preview.previewToken),
      requiresConfirmation: true,
      rollback:
        "If a reference update or source retirement fails, the connector attempts concurrency-safe reverse updates. An incomplete reversal is journaled for manual review.",
      note: "No data has been changed. Full reference discovery included transactions, reminders, reminder markers, and budgets."
    };
  }

  async applyCategoryConsolidation(input: { previewToken: string; confirmed: true }) {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = this.consolidationPreviews.begin(input.previewToken);
    if (started.state === "applied") return { ...started.result, applied: false, alreadyApplied: true };
    const plan = started.plan;
    await this.sync(false);
    const categories = await this.listTaxonomyCategories();
    const source = requireCategory(categories, plan.source.id);
    const target = requireCategory(categories, plan.target.id);
    if (source.changed !== plan.source.changed || target.changed !== plan.target.changed) {
      this.consolidationPreviews.reset(input.previewToken);
      throw new Error("source or target category changed after preview; create a new preview");
    }
    const currentSnapshot = await this.fullCategoryReferenceSnapshot();
    const currentReferences = referencesForConsolidation(currentSnapshot, source.id, target.id);
    if (
      currentSnapshot.budgets.some((budget) => budget.tag === source.id) ||
      !sameConsolidationReferences(currentReferences, plan.references)
    ) {
      this.consolidationPreviews.reset(input.previewToken);
      throw new Error("category references changed after preview; create a new preview");
    }

    const journalTargets: JournalTarget[] = [
      ...plan.references.map((reference) => ({
        id: `${reference.kind}:${reference.id}`,
        beforeFingerprint: referenceFingerprint(reference.kind, reference.beforeTags),
        expectedFingerprint: referenceFingerprint(reference.kind, reference.afterTags)
      })),
      {
        id: `category:${source.id}`,
        beforeFingerprint: consolidationCategoryFingerprint(source),
        expectedFingerprint: consolidationCategoryFingerprint(
          proposedCategory(source, plan.sourceRetirement.patch)
        )
      }
    ];
    const operation = await this.operationJournal.begin(
      input.previewToken,
      "category-consolidation",
      journalTargets
    );
    await this.emitOperation(
      "category-consolidation",
      operation.operationId,
      "write",
      "started",
      "apply_started"
    );
    const applied: Array<{ reference: CategoryReference; changed: number }> = [];
    let sourceAppliedChanged: number | null = null;
    try {
      for (const reference of plan.references) {
        await this.operationJournal.markWriteAttempt(operation.operationId);
        const result = requireAppliedWrite(
          await this.backend.call(consolidationUpdateTool(reference.kind), {
            id: reference.id,
            expectedChanged: reference.changed,
            patch: { tag: reference.afterTags }
          })
        );
        if (result.changed === null) throw new Error("ZenMoney did not return a reference concurrency version");
        applied.push({ reference, changed: result.changed });
      }
      await this.operationJournal.markWriteAttempt(operation.operationId);
      const retired = requireAppliedWrite(
        await this.backend.call("tags_update", {
          id: source.id,
          expectedChanged: requireCategoryChanged(source),
          patch: plan.sourceRetirement.patch
        })
      );
      sourceAppliedChanged = retired.changed;
      if (sourceAppliedChanged === null) throw new Error("ZenMoney did not return a category concurrency version");

      await this.operationJournal.markVerifying(operation.operationId);
      await this.emitOperation(
        "category-consolidation",
        operation.operationId,
        "verify",
        "started",
        "verification_started"
      );
      await this.sync(false);
      const verifiedSnapshot = await this.fullCategoryReferenceSnapshot();
      if (
        referencesForConsolidation(verifiedSnapshot, source.id, target.id).length > 0 ||
        verifiedSnapshot.budgets.some((budget) => budget.tag === source.id)
      ) {
        throw new Error("ZenMoney did not confirm removal of every source category reference");
      }
      const verifiedSource = requireCategory(await this.listTaxonomyCategories(), source.id);
      if (!categoryMatchesFields(verifiedSource, plan.sourceRetirement.patch)) {
        throw new Error("ZenMoney did not confirm source category retirement");
      }
      const counts = consolidationCounts(plan.references);
      const result = {
        applied: true,
        alreadyApplied: false,
        verified: true,
        operationId: operation.operationId,
        affected: counts,
        source: verifiedSource
      };
      await this.operationJournal.markCompleted(operation.operationId);
      await this.emitOperation(
        "category-consolidation",
        operation.operationId,
        "complete",
        "succeeded",
        "apply_verified"
      );
      this.consolidationPreviews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      const rollbackFailures = await this.rollbackCategoryConsolidation(
        plan,
        applied,
        sourceAppliedChanged
      );
      if (rollbackFailures.length > 0) {
        this.consolidationPreviews.markFailed(
          input.previewToken,
          "category consolidation requires manual review"
        );
        await this.operationJournal.markManualReview(operation.operationId, "rollback_incomplete");
        await this.emitOperation(
          "category-consolidation",
          operation.operationId,
          "complete",
          "uncertain",
          "rollback_incomplete"
        );
        throw new Error(
          `category consolidation failed and rollback was incomplete (${rollbackFailures.length} exact references require review)`
        );
      }
      this.consolidationPreviews.reset(input.previewToken);
      await this.operationJournal.markCompensated(operation.operationId);
      await this.emitOperation(
        "category-consolidation",
        operation.operationId,
        "compensate",
        "succeeded",
        "rollback_verified"
      );
      const message = error instanceof Error ? error.message : "category consolidation failed";
      throw new Error(`${message}; compensating rollback completed`);
    }
  }

  private async applyCategoryUpdatePlan(
    store: OperationPreviewStore<CategoryUpdatePlan, CategoryMutationResult>,
    input: { previewToken: string; confirmed: true },
    operation: "update" | "retire"
  ) {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = store.begin(input.previewToken);
    if (started.state === "applied") {
      return { ...started.result, applied: false, alreadyApplied: true };
    }
    const plan = started.plan;

    try {
      await this.sync(false);
      const categories = await this.listTaxonomyCategories();
      const current = requireCategory(categories, plan.categoryId);
      if (categoryMatchesFields(current, plan.patch)) {
        const result: CategoryMutationResult = {
          applied: false,
          alreadyApplied: true,
          verified: true,
          operation,
          category: current
        };
        store.markApplied(input.previewToken, result);
        return result;
      }
      if (current.changed !== plan.expectedChanged) {
        throw new Error("the category changed after preview; review it and create a new preview");
      }

      const proposed = proposedCategory(current, plan.patch);
      validateCategoryBehavior(proposed, operation === "retire" || current.retired);
      validateCategoryParent(categories, current.id, proposed.parent);
      if (operation === "retire") {
        const activeChildren = categories.filter(
          (candidate) => candidate.parent === current.id && !candidate.retired
        );
        if (activeChildren.length > 0) {
          throw new Error("an active child category was added after preview; create a new plan");
        }
      }
      if (proposed.parent !== current.parent && proposed.parent !== null) {
        const children = categories.filter((candidate) => candidate.parent === current.id);
        if (children.length > 0) throw new Error("a category with children cannot become a child category");
      }
      ensureUniqueSiblingTitle(categories, current.id, proposed.parent, proposed.title);

      requireAppliedWrite(
        await this.backend.call("tags_update", {
          id: current.id,
          expectedChanged: plan.expectedChanged,
          patch: plan.patch
        })
      );
      await this.sync(false);
      const updated = requireCategory(await this.listTaxonomyCategories(), current.id);
      if (!categoryMatchesFields(updated, plan.patch)) {
        throw new Error("ZenMoney did not confirm the requested category change");
      }

      const result: CategoryMutationResult = {
        applied: true,
        alreadyApplied: false,
        verified: true,
        operation,
        category: updated
      };
      store.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      store.reset(input.previewToken);
      throw error;
    }
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
      provenance: provenance([decision("categories", "zenmoney", "transaction-suggestion-api-filtered-to-active-categories")]),
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
    const receiptDate = resolveReceiptDate(receipt.date);
    const resolvedReceipt = { ...receipt, date: receiptDate.value };
    const dateWindowDays = options.dateWindowDays ?? 3;
    const transactions = await this.listTransactions({
      dateFrom: shiftDate(resolvedReceipt.date, -dateWindowDays),
      dateTo: shiftDate(resolvedReceipt.date, dateWindowDays),
      ...(receipt.accountId ? { accountId: receipt.accountId } : {}),
      limit: 500
    });
    const candidates = rankReceiptMatches(resolvedReceipt, transactions, options);
    const top = candidates[0];
    const runnerUp = candidates[1];
    const ambiguous = !top || top.score < 70 || (runnerUp !== undefined && top.score - runnerUp.score < 10);
    const confidence = !top ? "none" : top.score >= 85 ? "high" : top.score >= 70 ? "medium" : "low";

    return {
      searchDate: resolvedReceipt.date,
      suggestedFields: receiptDate.suggested
        ? [
            {
              field: "date",
              value: receiptDate.value,
              suggested: true,
              basis: receiptDate.basis,
              confidence: receiptDate.confidence,
              reason: receiptDate.reason
            }
          ]
        : [],
      receiptCurrency: receipt.currency ?? null,
      currencyNote:
        "Matching checks both the ZenMoney account amount and its original operation amount when available; the receipt currency code is not mapped to a ZenMoney instrument id.",
      confidence,
      ambiguous,
      provenance: provenance([
        decision("receiptFacts", "caller", "structured-input-not-independently-verified"),
        decision("searchDate", receiptDate.suggested ? "server-rule" : "caller", receiptDate.suggested ? "mcp-process-local-calendar" : "supplied-date"),
        decision("candidates", "server-rule", "amount-date-account-merchant-scoring"),
        decision("ambiguous", "server-rule", !top ? "no-candidates" : top.score < 70 ? "top-score-below-70" : ambiguous ? "top-score-gap-below-10" : "score-and-gap-accepted")
      ]),
      guidance: ambiguous
        ? "Do not change anything yet. Ask the user to select or clarify the transaction."
        : "Use the top transaction id to preview a category change before requesting confirmation.",
      candidates
    };
  }

  async previewCategory(input: {
    transactionId: string;
    tagIds: string[];
    evidenceGroups?: ReceiptEvidenceGroup[] | undefined;
  }) {
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
    const evidenceGroups = validateReceiptEvidenceGroups(input.evidenceGroups, transaction.outcome);

    const categories = await this.listCategories(false);
    const byId = new Map(
      categories.filter((category) => !category.archive).map((category) => [category.id, category])
    );
    const selected = input.tagIds.map((id) => byId.get(id));
    if (selected.some((category) => category === undefined)) {
      throw new Error("one or more category ids are missing or archived");
    }
    validateEvidenceCategories(evidenceGroups, new Set(input.tagIds));

    const signed = this.previews.create({
      transactionId: transaction.id,
      expectedChanged: transaction.changed,
      tagIds: input.tagIds,
      evidenceGroups
    });
    return {
      operation: "replace transaction categories",
      provenance: provenance([
        decision("before", "zenmoney", "current-expense-snapshot"),
        decision("categories", "caller", "selected-active-category-ids"),
        decision("evidenceGroups", "caller", "contract-validated-purpose-groups")
      ]),
      before: { transaction, categories: categoryNames(transaction.tag, categories) },
      proposed: { tagIds: input.tagIds, categories: selected.map((category) => category!.title) },
      receiptMemory: await this.describeReceiptMemory(evidenceGroups),
      previewToken: signed.token,
      operationId: operationIdForPreviewToken(signed.token),
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
      return {
        applied: false,
        alreadyApplied: true,
        verified: true,
        transaction: current,
        receiptMemory: await this.recordReceiptMemory({
          transactionIds: [current.id],
          receiptDate: current.date,
          instrument: current.outcomeInstrument,
          groups: preview.evidenceGroups
        })
      };
    }
    if (current.changed !== preview.expectedChanged) {
      throw new Error("transaction changed after preview; review it and create a new preview");
    }
    const operation = await this.operationJournal.begin(input.previewToken, "receipt-category", [
      {
        id: current.id,
        beforeFingerprint: transactionFingerprint(current),
        expectedFingerprint: transactionFingerprint({ ...current, tag: preview.tagIds })
      }
    ]);
    await this.emitOperation("receipt-category", operation.operationId, "write", "started", "apply_started");
    try {
      await this.operationJournal.markWriteAttempt(operation.operationId);
      await this.backend.call("transactions_update", {
        id: preview.transactionId,
        expectedChanged: preview.expectedChanged,
        patch: { tag: preview.tagIds }
      });
      await this.operationJournal.markVerifying(operation.operationId);
      await this.emitOperation("receipt-category", operation.operationId, "verify", "started", "verification_started");
      await this.sync(false);
      const updated = requireTransaction(
        await this.backend.call("transactions_get", { id: preview.transactionId })
      );
      if (!sameIds(updated.tag, preview.tagIds)) {
        throw new Error("ZenMoney did not confirm the requested category change");
      }
      await this.operationJournal.markCompleted(operation.operationId);
      await this.emitOperation("receipt-category", operation.operationId, "complete", "succeeded", "apply_verified");
      return {
        applied: true,
        alreadyApplied: false,
        verified: true,
        operationId: operation.operationId,
        transaction: updated,
        receiptMemory: await this.recordReceiptMemory({
          transactionIds: [updated.id],
          receiptDate: updated.date,
          instrument: updated.outcomeInstrument,
          groups: preview.evidenceGroups
        })
      };
    } catch (error) {
      await this.operationJournal.markManualReview(operation.operationId, "category_apply_uncertain");
      await this.emitOperation("receipt-category", operation.operationId, "complete", "uncertain", "manual_review");
      throw error;
    }
  }

  async previewReceiptReconciliation(input: {
    receiptTotal: number;
    allocations: Array<{ transactionId: string; parts: ReceiptPart[] }>;
    evidenceGroups?: ReceiptEvidenceGroup[] | undefined;
  }) {
    validateMoney(input.receiptTotal, "receipt total");
    const evidenceGroups = validateReceiptEvidenceGroups(input.evidenceGroups, input.receiptTotal);
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
    validateEvidenceCategories(
      evidenceGroups,
      new Set(allocations.flatMap((allocation) => allocation.parts.flatMap((part) => part.tagIds)))
    );

    const plan: ReconciliationPlan = {
      receiptTotal: input.receiptTotal,
      sourceTotal: sourceTotal / 100,
      allocatedTotal: allocatedTotal / 100,
      allocations,
      evidenceGroups
    };
    const preview = this.reconciliationPreviews.create(plan);
    return {
      operation: "reconcile existing receipt expenses",
      provenance: provenance([
        decision("before", "zenmoney", "current-expense-snapshots"),
        decision("allocations", "caller", "category-and-total-contract-validated"),
        decision("evidenceGroups", "caller", "contract-validated-purpose-groups")
      ]),
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
      receiptMemory: await this.describeReceiptMemory(evidenceGroups),
      ...preview,
      operationId: operationIdForPreviewToken(preview.previewToken),
      requiresConfirmation: true,
      rollback:
        "If a multi-step apply fails, the connector attempts to delete created split parts and restore every source amount/category before reporting failure.",
      note: "No data has been changed."
    };
  }

  async previewNewReceipt(input: {
    receiptTotal: number;
    accountId?: string | undefined;
    accountHint?: string | undefined;
    date?: string | undefined;
    payee?: string | undefined;
    comment?: string | undefined;
    parts: ReceiptPart[];
    evidenceGroups?: ReceiptEvidenceGroup[] | undefined;
  }) {
    validateMoney(input.receiptTotal, "receipt total");
    const evidenceGroups = validateReceiptEvidenceGroups(input.evidenceGroups, input.receiptTotal);
    const receiptDate = resolveReceiptDate(input.date);
    const accountHint = validateAccountHint(input.accountHint);
    if (input.accountId && accountHint) {
      throw new Error("accountHint must be omitted when an exact accountId is supplied");
    }
    const [accounts, categories] = await Promise.all([
      this.listAccounts(false),
      this.listCategories(false)
    ]);
    const activeCategoryIds = new Set(
      categories.filter((category) => !category.archive).map((category) => category.id)
    );
    validateParts(input.parts, activeCategoryIds);
    validateEvidenceCategories(
      evidenceGroups,
      new Set(input.parts.flatMap((part) => part.tagIds))
    );
    if (input.parts.reduce((total, part) => total + cents(part.amount), 0) !== cents(input.receiptTotal)) {
      throw new Error("new expense parts must sum exactly to the receipt total");
    }
    let account = input.accountId
      ? accounts.find((candidate) => candidate.id === input.accountId)
      : undefined;
    let accountSuggestion: ReturnType<typeof recommendReceiptAccount> | undefined;
    if (!input.accountId) {
      const transactions = await this.listTransactions({ limit: 500 });
      accountSuggestion = recommendReceiptAccount({
        accounts,
        transactions,
        accountHint,
        payee: input.payee,
        tagIds: input.parts.flatMap((part) => part.tagIds)
      });
      account = accountSuggestion.account;
    }
    if (!account || account.archive || account.instrument === null) {
      throw new Error("the selected account is missing, archived, or has no currency instrument");
    }

    const plan: NewReceiptPlan = {
      receiptTotal: input.receiptTotal,
      accountId: account.id,
      instrument: account.instrument,
      date: receiptDate.value,
      payee: input.payee?.trim() || null,
      comment: input.comment?.trim() || null,
      parts: input.parts.map((part) => ({ ...part, transactionId: randomUUID() })),
      evidenceGroups
    };
    const preview = this.creationPreviews.create(plan);
    return {
      operation: plan.parts.length === 1 ? "create receipt expense" : "create allocated receipt expenses",
      provenance: provenance([
        decision("date", receiptDate.suggested ? "server-rule" : "caller", receiptDate.suggested ? "mcp-process-local-calendar" : "supplied-date"),
        decision("account", accountSuggestion ? "server-rule" : "caller", accountSuggestion?.basis ?? "supplied-account"),
        decision("parts", "caller", "category-and-total-contract-validated"),
        decision("evidenceGroups", "caller", "contract-validated-purpose-groups")
      ]),
      account,
      receiptTotal: plan.receiptTotal,
      date: plan.date,
      payee: plan.payee,
      suggestedFields: [
        ...(receiptDate.suggested
          ? [
              {
                field: "date" as const,
                value: receiptDate.value,
                suggested: true as const,
                basis: receiptDate.basis,
                confidence: receiptDate.confidence,
                reason: receiptDate.reason
              }
            ]
          : []),
        ...(accountSuggestion
          ? [
              {
                field: "accountId" as const,
                value: accountSuggestion.account.id,
                label: accountSuggestion.account.title,
                suggested: true as const,
                basis: accountSuggestion.basis,
                confidence: accountSuggestion.confidence,
                reason: accountSuggestion.reason
              }
            ]
          : [])
      ],
      parts: plan.parts.map((part) => ({
        transactionId: part.transactionId,
        amount: part.amount,
        tagIds: part.tagIds,
        categories: categoryNames(part.tagIds, categories)
      })),
      receiptMemory: await this.describeReceiptMemory(evidenceGroups),
      ...preview,
      operationId: operationIdForPreviewToken(preview.previewToken),
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
    const journalTargets: JournalTarget[] = plan.allocations.flatMap((allocation) =>
      allocation.parts.map((part, index) => ({
        id: part.transactionId,
        beforeFingerprint: index === 0 ? transactionFingerprint(allocation.source) : null,
        expectedFingerprint: plannedTransactionFingerprint({
          amount: part.amount,
          accountId: allocation.source.outcomeAccount!,
          instrument: allocation.source.outcomeInstrument!,
          date: allocation.source.date!,
          tagIds: part.tagIds
        })
      }))
    );
    const operation = await this.operationJournal.begin(
      input.previewToken,
      "receipt-reconciliation",
      journalTargets
    );
    await this.emitOperation(
      "receipt-reconciliation",
      operation.operationId,
      "write",
      "started",
      "apply_started"
    );

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
            await this.operationJournal.markWriteAttempt(operation.operationId);
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
          await this.operationJournal.markWriteAttempt(operation.operationId);
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

      await this.operationJournal.markVerifying(operation.operationId);
      await this.emitOperation(
        "receipt-reconciliation",
        operation.operationId,
        "verify",
        "started",
        "verification_started"
      );
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
        transactions,
        operationId: operation.operationId,
        receiptMemory: await this.recordReceiptMemory({
          transactionIds: transactions.map((transaction) => transaction.id),
          receiptDate: plan.allocations[0]?.source.date ?? null,
          instrument: plan.allocations[0]?.source.outcomeInstrument ?? null,
          groups: plan.evidenceGroups
        })
      };
      await this.operationJournal.markCompleted(operation.operationId);
      await this.emitOperation(
        "receipt-reconciliation",
        operation.operationId,
        "complete",
        "succeeded",
        "apply_verified"
      );
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
        await this.operationJournal.markManualReview(operation.operationId, "rollback_incomplete");
        await this.emitOperation(
          "receipt-reconciliation",
          operation.operationId,
          "complete",
          "uncertain",
          "rollback_incomplete"
        );
        throw new Error(`${message} (${rollbackFailures.length} rollback errors)`);
      }
      this.reconciliationPreviews.reset(input.previewToken);
      await this.operationJournal.markCompensated(operation.operationId);
      await this.emitOperation(
        "receipt-reconciliation",
        operation.operationId,
        "compensate",
        "succeeded",
        "rollback_verified"
      );
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
    const operation = await this.operationJournal.begin(
      input.previewToken,
      "receipt-create",
      plan.parts.map((part) => ({
        id: part.transactionId,
        beforeFingerprint: null,
        expectedFingerprint: plannedTransactionFingerprint({
          amount: part.amount,
          accountId: plan.accountId,
          instrument: plan.instrument,
          date: plan.date,
          tagIds: part.tagIds
        })
      }))
    );
    await this.emitOperation("receipt-create", operation.operationId, "write", "started", "apply_started");

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
        await this.operationJournal.markWriteAttempt(operation.operationId);
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

      await this.operationJournal.markVerifying(operation.operationId);
      await this.emitOperation("receipt-create", operation.operationId, "verify", "started", "verification_started");
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
        transactions,
        operationId: operation.operationId,
        receiptMemory: await this.recordReceiptMemory({
          transactionIds: transactions.map((transaction) => transaction.id),
          receiptDate: plan.date,
          instrument: plan.instrument,
          groups: plan.evidenceGroups
        })
      };
      await this.operationJournal.markCompleted(operation.operationId);
      await this.emitOperation("receipt-create", operation.operationId, "complete", "succeeded", "apply_verified");
      this.creationPreviews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      const rollbackFailures = await this.rollbackCreated(createdIds);
      if (rollbackFailures.length > 0) {
        const message =
          "new receipt creation failed and compensating rollback was incomplete; inspect the previewed transaction ids manually";
        this.creationPreviews.markFailed(input.previewToken, message);
        await this.operationJournal.markManualReview(operation.operationId, "rollback_incomplete");
        await this.emitOperation("receipt-create", operation.operationId, "complete", "uncertain", "rollback_incomplete");
        throw new Error(`${message} (${rollbackFailures.length} rollback errors)`);
      }
      this.creationPreviews.reset(input.previewToken);
      await this.operationJournal.markCompensated(operation.operationId);
      await this.emitOperation("receipt-create", operation.operationId, "compensate", "succeeded", "rollback_verified");
      const message = error instanceof Error ? error.message : "new receipt creation failed";
      throw new Error(`${message}; compensating rollback completed`);
    }
  }

  private async describeReceiptMemory(groups: ReceiptEvidenceGroup[]) {
    const status = await this.receiptMemory.status();
    return {
      enabled: status.enabled,
      available: !status.corrupt,
      willRecordEvidence: status.enabled && !status.corrupt && groups.length > 0,
      willEvaluateReviewReadiness: true,
      retentionDays: status.retentionDays,
      evidenceGroups: groups,
      privacy: status.privacy,
      ...(status.error ? { error: status.error } : {})
    };
  }

  private async recordReceiptMemory(input: {
    transactionIds: string[];
    receiptDate: string | null;
    instrument: number | null;
    groups: ReceiptEvidenceGroup[];
  }): Promise<ReceiptMemoryResult> {
    if (input.receiptDate === null || input.instrument === null) {
      let readiness: Awaited<ReturnType<ReceiptMemoryController["readiness"]>> | null = null;
      try {
        readiness = await this.receiptMemory.readiness();
      } catch {
        // The financial operation has already been verified; local memory must not undo it.
      }
      return {
        status: "unavailable",
        error: "verified transaction lacks a date or instrument required for local receipt evidence",
        reviewReadiness: readiness
      };
    }
    try {
      return await this.receiptMemory.recordVerified({
        transactionIds: input.transactionIds,
        receiptDate: input.receiptDate,
        instrument: input.instrument,
        groups: input.groups
      });
    } catch (error) {
      let readiness: Awaited<ReturnType<ReceiptMemoryController["readiness"]>> | null = null;
      try {
        readiness = await this.receiptMemory.readiness();
      } catch {
        // Report the bounded failure below without masking the verified ZenMoney result.
      }
      return {
        status: "unavailable",
        error: error instanceof Error ? error.message.slice(0, 240) : "local receipt memory failed",
        reviewReadiness: readiness
      };
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

  private async fullCategoryReferenceSnapshot(): Promise<FullCategoryReferenceSnapshot> {
    return parseFullCategoryReferenceSnapshot(
      await this.backend.call("receipt_full_reference_snapshot", {})
    );
  }

  private async rollbackCategoryConsolidation(
    plan: CategoryConsolidationPlan,
    applied: Array<{ reference: CategoryReference; changed: number }>,
    sourceAppliedChanged: number | null
  ): Promise<string[]> {
    const failures: string[] = [];
    if (sourceAppliedChanged !== null) {
      try {
        requireAppliedWrite(
          await this.backend.call("tags_update", {
            id: plan.source.id,
            expectedChanged: sourceAppliedChanged,
            patch: {
              showIncome: plan.source.showIncome,
              showOutcome: plan.source.showOutcome,
              budgetIncome: plan.source.budgetIncome,
              budgetOutcome: plan.source.budgetOutcome
            }
          })
        );
      } catch {
        failures.push(`category:${plan.source.id}`);
      }
    }
    for (const item of [...applied].reverse()) {
      try {
        requireAppliedWrite(
          await this.backend.call(consolidationUpdateTool(item.reference.kind), {
            id: item.reference.id,
            expectedChanged: item.changed,
            patch: { tag: item.reference.beforeTags }
          })
        );
      } catch {
        failures.push(`${item.reference.kind}:${item.reference.id}`);
      }
    }
    try {
      await this.sync(false);
      const snapshot = await this.fullCategoryReferenceSnapshot();
      const byKind = consolidationReferenceMap(snapshot);
      for (const reference of applied.map((item) => item.reference)) {
        const current = byKind.get(`${reference.kind}:${reference.id}`);
        if (!current || !sameTags(current.tag, reference.beforeTags)) {
          failures.push(`${reference.kind}:${reference.id}`);
        }
      }
      if (sourceAppliedChanged !== null) {
        const source = requireCategory(await this.listTaxonomyCategories(), plan.source.id);
        if (consolidationCategoryFingerprint(source) !== consolidationCategoryFingerprint(plan.source)) {
          failures.push(`category:${plan.source.id}`);
        }
      }
    } catch {
      failures.push(...applied.map((item) => `${item.reference.kind}:${item.reference.id}`));
      if (sourceAppliedChanged !== null) failures.push(`category:${plan.source.id}`);
    }
    return [...new Set(failures)];
  }

  async listOperationRecovery(limit = 20) {
    return {
      untrustedData: false,
      records: await this.operationJournal.list(limit),
      privacy:
        "Journal listings omit target ids, plan fingerprints, preview tokens, amounts, categories, payees, and raw responses."
    };
  }

  async inspectOperationRecovery(operationId: string) {
    if (!/^op_[a-f0-9]{32}$/.test(operationId)) throw new Error("operation id is invalid");
    const record = await this.operationJournal.get(operationId);
    if (!record) throw new Error("operation journal record was not found or has expired");
    const actual = new Map<string, string | null>();
    await this.sync(false);
    if (record.kind === "category-consolidation") {
      const snapshot = await this.fullCategoryReferenceSnapshot();
      const references = consolidationReferenceMap(snapshot);
      const categories = new Map(
        (await this.listTaxonomyCategories()).map((category) => [category.id, category])
      );
      for (const target of record.targets) {
        if (target.id.startsWith("category:")) {
          const categoryId = target.id.slice("category:".length);
          actual.set(target.id, consolidationCategoryFingerprint(categories.get(categoryId) ?? null));
          continue;
        }
        const reference = references.get(target.id);
        actual.set(
          target.id,
          reference ? referenceFingerprint(reference.kind, reference.tag) : null
        );
      }
    } else {
      for (const target of record.targets) {
        const transaction = projectTransaction(
          await this.backend.call("transactions_get", { id: target.id })
        );
        actual.set(target.id, transactionFingerprint(transaction));
      }
    }
    const classification = this.operationJournal.classify(record, actual);
    return {
      ...classification,
      targetIds: classification.classification === "manual-review" ? record.targets.map((target) => target.id) : [],
      privacy:
        "Exact target ids are returned only for manual review; transaction values and one-way fingerprints are never returned."
    };
  }

  private async emitOperation(
    operationKind:
      | "receipt-category"
      | "receipt-reconciliation"
      | "receipt-create"
      | "category-consolidation",
    operationId: string,
    phase: "write" | "verify" | "compensate" | "complete",
    outcome: "started" | "succeeded" | "uncertain",
    code: string
  ): Promise<void> {
    try {
      await this.events.emit({
        name: "operation.phase",
        component: operationKind === "category-consolidation" ? "taxonomy-operation" : "receipt-operation",
        operationKind,
        operationId,
        phase,
        outcome,
        code
      });
    } catch {
      // Diagnostic storage must never change financial operation behavior.
    }
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

  async spendingInsights(input: { dateFrom: string; dateTo: string; limit?: number }) {
    const limit = Math.min(input.limit ?? 500, 500);
    const [transactions, categories] = await Promise.all([
      this.listTransactions({ dateFrom: input.dateFrom, dateTo: input.dateTo, limit }),
      this.listCategories(false)
    ]);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const expenseTransactions = transactions.filter(
      (transaction) => !transaction.deleted && transaction.outcome > 0 && transaction.income <= 0
    );
    const byInstrument = new Map<
      string,
      {
        instrument: number | null;
        total: number;
        transactionCount: number;
        months: Map<string, number>;
        categories: Map<string, { categoryId: string | null; category: string; total: number; transactionCount: number }>;
        payees: Map<string, { payee: string; total: number; transactionCount: number; months: Set<string> }>;
        largest: Array<{ id: string; date: string | null; payee: string | null; category: string; amount: number }>;
      }
    >();

    for (const transaction of expenseTransactions) {
      const instrumentKey = String(transaction.outcomeInstrument ?? "unknown");
      const bucket = byInstrument.get(instrumentKey) ?? {
        instrument: transaction.outcomeInstrument,
        total: 0,
        transactionCount: 0,
        months: new Map<string, number>(),
        categories: new Map(),
        payees: new Map(),
        largest: [] as Array<{
          id: string;
          date: string | null;
          payee: string | null;
          category: string;
          amount: number;
        }>
      };
      const month = transaction.date?.slice(0, 7) ?? "unknown";
      const categoryId = primaryCategory(transaction.tag, byId);
      const category = categoryId ? byId.get(categoryId)?.title ?? "Unknown category" : "Uncategorized";
      const categoryKey = categoryId ?? "uncategorized";
      const categoryBucket = bucket.categories.get(categoryKey) ?? {
        categoryId,
        category,
        total: 0,
        transactionCount: 0
      };
      categoryBucket.total += transaction.outcome;
      categoryBucket.transactionCount += 1;
      bucket.categories.set(categoryKey, categoryBucket);

      const payee = transaction.payee ?? transaction.merchant;
      if (payee) {
        const payeeBucket = bucket.payees.get(payee) ?? {
          payee,
          total: 0,
          transactionCount: 0,
          months: new Set<string>()
        };
        payeeBucket.total += transaction.outcome;
        payeeBucket.transactionCount += 1;
        payeeBucket.months.add(month);
        bucket.payees.set(payee, payeeBucket);
      }

      bucket.total += transaction.outcome;
      bucket.transactionCount += 1;
      bucket.months.set(month, (bucket.months.get(month) ?? 0) + transaction.outcome);
      bucket.largest.push({ id: transaction.id, date: transaction.date, payee, category, amount: transaction.outcome });
      byInstrument.set(instrumentKey, bucket);
    }

    return {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      transactionCountExamined: transactions.length,
      expenseTransactionCount: expenseTransactions.length,
      possiblyTruncated: transactions.length === limit,
      evidenceBoundary:
        "These are descriptive signals, not guaranteed savings. Ask the user about needs, commitments, and goals before recommending a cut.",
      currencySafety: "Every instrument is independent; never add or compare raw totals across instrument ids.",
      instruments: [...byInstrument.values()]
        .map((bucket) => ({
          instrument: bucket.instrument,
          total: roundMoney(bucket.total),
          transactionCount: bucket.transactionCount,
          averagePerActiveMonth: roundMoney(bucket.total / Math.max(bucket.months.size, 1)),
          monthlyTotals: [...bucket.months.entries()]
            .map(([month, total]) => ({ month, total: roundMoney(total) }))
            .sort((left, right) => left.month.localeCompare(right.month)),
          categories: [...bucket.categories.values()]
            .map((category) => ({
              ...category,
              total: roundMoney(category.total),
              shareOfInstrumentSpend: bucket.total > 0 ? Math.round((category.total / bucket.total) * 10_000) / 100 : 0
            }))
            .sort((left, right) => right.total - left.total)
            .slice(0, 30),
          recurringPayeeCandidates: [...bucket.payees.values()]
            .filter((payee) => payee.transactionCount >= 2 && payee.months.size >= 2)
            .map((payee) => ({
              payee: payee.payee,
              total: roundMoney(payee.total),
              transactionCount: payee.transactionCount,
              activeMonths: payee.months.size
            }))
            .sort((left, right) => right.total - left.total)
            .slice(0, 20),
          largestExpenses: bucket.largest.sort((left, right) => right.amount - left.amount).slice(0, 20)
        }))
        .sort((left, right) => String(left.instrument).localeCompare(String(right.instrument)))
    };
  }

  receiptMemoryStatus() {
    return this.receiptMemory.status();
  }

  receiptMemorySearch(input: {
    query?: string | undefined;
    categoryId?: string | undefined;
    monthFrom?: string | undefined;
    monthTo?: string | undefined;
    limit?: number | undefined;
  }) {
    return this.receiptMemory.search(input);
  }

  receiptMemoryGet(recordId: string) {
    return this.receiptMemory.get(recordId);
  }

  previewReceiptMemorySettings(input: { enabled: boolean; retentionDays?: number | undefined }) {
    return this.receiptMemory.previewSettings(input);
  }

  applyReceiptMemorySettings(input: { previewToken: string; confirmed: true }) {
    return this.receiptMemory.applySettings(input);
  }

  previewReceiptMemoryDelete(recordId: string) {
    return this.receiptMemory.previewDelete(recordId);
  }

  applyReceiptMemoryDelete(input: { previewToken: string; confirmed: true }) {
    return this.receiptMemory.applyDelete(input);
  }

  previewReceiptMemoryPurge() {
    return this.receiptMemory.previewPurge();
  }

  applyReceiptMemoryPurge(input: { previewToken: string; confirmed: true }) {
    return this.receiptMemory.applyPurge(input);
  }

  async close(): Promise<void> {
    await this.backend.close();
  }
}

function consolidationCounts(references: CategoryReference[]) {
  return {
    transactions: references.filter((reference) => reference.kind === "transaction").length,
    reminders: references.filter((reference) => reference.kind === "reminder").length,
    reminderMarkers: references.filter((reference) => reference.kind === "reminder-marker").length
  };
}

function consolidationUpdateTool(kind: ConsolidationReferenceKind): string {
  if (kind === "transaction") return "transactions_update";
  if (kind === "reminder") return "reminders_update";
  return "reminder_markers_update";
}

function consolidationReferenceMap(snapshot: FullCategoryReferenceSnapshot) {
  const result = new Map<
    string,
    { kind: ConsolidationReferenceKind; id: string; changed: number; tag: string[] }
  >();
  const add = (
    kind: ConsolidationReferenceKind,
    values: FullCategoryReferenceSnapshot["transactions"]
  ) => {
    for (const value of values) {
      if (!value.deleted && value.state !== "deleted") {
        result.set(`${kind}:${value.id}`, { kind, id: value.id, changed: value.changed, tag: value.tag });
      }
    }
  };
  add("transaction", snapshot.transactions);
  add("reminder", snapshot.reminders);
  add("reminder-marker", snapshot.reminderMarkers);
  return result;
}

function sameConsolidationReferences(left: CategoryReference[], right: CategoryReference[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((reference, index) => {
    const expected = right[index];
    return (
      expected !== undefined &&
      reference.kind === expected.kind &&
      reference.id === expected.id &&
      reference.changed === expected.changed &&
      sameTags(reference.beforeTags, expected.beforeTags) &&
      sameTags(reference.afterTags, expected.afterTags)
    );
  });
}

function primaryCategory(tagIds: string[], byId: Map<string, ZenTag>): string | null {
  return tagIds.find((id) => byId.get(id)?.parent !== null && byId.has(id)) ?? tagIds[0] ?? null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function categoryNames(tagIds: string[], categories: ZenTag[]): string[] {
  const byId = new Map(categories.map((category) => [category.id, category.title]));
  return tagIds.map((id) => byId.get(id) ?? "Unknown category");
}

function normalizeCategoryTitle(value: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("category title contains unsupported control characters");
  }
  const title = value.trim();
  if (title.length === 0 || title.length > 120) {
    throw new Error("category title must contain 1 to 120 characters");
  }
  return title;
}

function requireCategory(categories: ZenTag[], categoryId: string): ZenTag {
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category) throw new Error("category was not found");
  return category;
}

function requireCategoryChanged(category: ZenTag): number {
  if (category.changed === null) {
    throw new Error("category has no concurrency version and cannot be changed safely");
  }
  return category.changed;
}

function validateCategoryBehavior(
  fields: Pick<
    CategoryCreateFields,
    "showIncome" | "showOutcome"
  >,
  allowRetired: boolean
): void {
  if (!allowRetired && !fields.showIncome && !fields.showOutcome) {
    throw new Error("a category must be available for income or expense; use retirement for neither");
  }
}

function validateCategoryParent(
  categories: ZenTag[],
  categoryId: string | null,
  parentId: string | null
): ZenTag | null {
  if (parentId === null) return null;
  if (parentId === categoryId) throw new Error("a category cannot be its own parent");
  const parent = requireCategory(categories, parentId);
  if (parent.retired) throw new Error("a retired category cannot be selected as a parent");
  if (parent.parent !== null) {
    throw new Error("ZenMoney supports one category parent level; select a top-level parent");
  }
  return parent;
}

function ensureUniqueSiblingTitle(
  categories: ZenTag[],
  categoryId: string | null,
  parentId: string | null,
  title: string
): void {
  const folded = title.normalize("NFKC").toLowerCase();
  const duplicate = categories.find(
    (candidate) =>
      candidate.id !== categoryId &&
      candidate.parent === parentId &&
      candidate.title.normalize("NFKC").toLowerCase() === folded
  );
  if (duplicate) {
    throw new Error("a sibling category with the same normalized title already exists");
  }
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

function validateEvidenceCategories(
  groups: ReceiptEvidenceGroup[],
  receiptCategoryIds: Set<string>
): void {
  for (const group of groups) {
    if (!receiptCategoryIds.has(group.categoryId)) {
      throw new Error(
        `receipt memory purpose '${group.purpose}' references a category not used by the proposed receipt transactions`
      );
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
    throw new Error("ZenMoney write response is missing the entity id");
  }
  const changed =
    typeof result.snapshotChanged === "number"
      ? result.snapshotChanged
      : typeof result.sentChanged === "number"
        ? result.sentChanged
        : null;
  return { id: result.id, changed };
}
