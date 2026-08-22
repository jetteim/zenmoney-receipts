import { createHash } from "node:crypto";

import type { CategoryUpdatePlan } from "./taxonomy-operations.js";
import type { ZenTag } from "./types.js";

export type ConsolidationReferenceKind = "transaction" | "reminder" | "reminder-marker";

export interface CategoryReference {
  kind: ConsolidationReferenceKind;
  id: string;
  changed: number;
  beforeTags: string[];
  afterTags: string[];
}

export interface FullCategoryReferenceSnapshot {
  transactions: Array<{ id: string; changed: number; tag: string[]; deleted: boolean; state: string | null }>;
  reminders: Array<{ id: string; changed: number; tag: string[]; deleted: boolean; state: string | null }>;
  reminderMarkers: Array<{ id: string; changed: number; tag: string[]; deleted: boolean; state: string | null }>;
  budgets: Array<{ changed: number; user: number | string | null; date: string | null; tag: string | null }>;
}

export interface CategoryConsolidationPlan {
  source: ZenTag;
  target: ZenTag;
  references: CategoryReference[];
  sourceBudgetReferences: number;
  sourceRetirement: CategoryUpdatePlan;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function entityArray(value: unknown, field: string): FullCategoryReferenceSnapshot["transactions"] {
  if (!Array.isArray(value)) throw new Error(`full reference snapshot ${field} is invalid`);
  return value.map((candidate) => {
    const record = asRecord(candidate);
    if (
      typeof record.id !== "string" ||
      !Number.isFinite(record.changed) ||
      !Array.isArray(record.tag) ||
      !record.tag.every((tag) => typeof tag === "string")
    ) {
      throw new Error(`full reference snapshot ${field} contains an invalid record`);
    }
    return {
      id: record.id,
      changed: record.changed as number,
      tag: record.tag as string[],
      deleted: record.deleted === true,
      state: typeof record.state === "string" ? record.state : null
    };
  });
}

export function parseFullCategoryReferenceSnapshot(value: unknown): FullCategoryReferenceSnapshot {
  const record = asRecord(value);
  if (!Array.isArray(record.budgets)) throw new Error("full reference snapshot budgets is invalid");
  return {
    transactions: entityArray(record.transactions, "transactions"),
    reminders: entityArray(record.reminders, "reminders"),
    reminderMarkers: entityArray(record.reminderMarkers, "reminderMarkers"),
    budgets: record.budgets.map((candidate) => {
      const budget = asRecord(candidate);
      if (
        !Number.isFinite(budget.changed) ||
        !(typeof budget.user === "number" || typeof budget.user === "string" || budget.user === null) ||
        !(typeof budget.date === "string" || budget.date === null) ||
        !(typeof budget.tag === "string" || budget.tag === null)
      ) {
        throw new Error("full reference snapshot budgets contains an invalid record");
      }
      return {
        changed: budget.changed as number,
        user: budget.user as number | string | null,
        date: budget.date as string | null,
        tag: budget.tag as string | null
      };
    })
  };
}

export function replaceCategory(tags: string[], sourceId: string, targetId: string): string[] {
  const replaced = tags.map((tag) => tag === sourceId ? targetId : tag);
  return [...new Set(replaced)];
}

export function referencesForConsolidation(
  snapshot: FullCategoryReferenceSnapshot,
  sourceId: string,
  targetId: string
): CategoryReference[] {
  const map = (
    kind: ConsolidationReferenceKind,
    entities: FullCategoryReferenceSnapshot["transactions"]
  ): CategoryReference[] =>
    entities
      .filter((entity) => !entity.deleted && entity.state !== "deleted" && entity.tag.includes(sourceId))
      .map((entity) => ({
        kind,
        id: entity.id,
        changed: entity.changed,
        beforeTags: [...entity.tag],
        afterTags: replaceCategory(entity.tag, sourceId, targetId)
      }));
  return [
    ...map("transaction", snapshot.transactions),
    ...map("reminder", snapshot.reminders),
    ...map("reminder-marker", snapshot.reminderMarkers)
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function referenceFingerprint(kind: ConsolidationReferenceKind, tags: string[] | null): string | null {
  return tags === null ? null : hash({ kind, tags: [...tags].sort() });
}

export function consolidationCategoryFingerprint(category: ZenTag | null): string | null {
  return category === null
    ? null
    : hash({
        kind: "category",
        id: category.id,
        title: category.title,
        parent: category.parent,
        showIncome: category.showIncome,
        showOutcome: category.showOutcome,
        budgetIncome: category.budgetIncome,
        budgetOutcome: category.budgetOutcome,
        required: category.required
      });
}
