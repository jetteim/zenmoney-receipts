import type { ZenTag } from "./types.js";

export interface CategoryCreateFields {
  title: string;
  parent: string | null;
  showIncome: boolean;
  showOutcome: boolean;
  budgetIncome: boolean;
  budgetOutcome: boolean;
  required: boolean | null;
}

export type CategoryPatch = Partial<CategoryCreateFields>;

export interface CategoryCreatePlan {
  proposed: CategoryCreateFields;
  expectedParentChanged: number | null;
}

export interface CategoryUpdatePlan {
  categoryId: string;
  expectedChanged: number;
  before: ZenTag;
  patch: CategoryPatch;
}

export interface CategoryMutationResult {
  applied: boolean;
  alreadyApplied: boolean;
  verified: boolean;
  operation: "create" | "update" | "retire";
  category: ZenTag;
}

export function categoryMatchesFields(
  category: ZenTag,
  fields: CategoryCreateFields | CategoryPatch
): boolean {
  return Object.entries(fields).every(([field, expected]) => {
    const key = field as keyof CategoryCreateFields;
    return category[key] === expected;
  });
}

export function proposedCategory(before: ZenTag, patch: CategoryPatch): ZenTag {
  return { ...before, ...patch, retired: retiredAfter(before, patch) };
}

export function retiredAfter(before: ZenTag, patch: CategoryPatch): boolean {
  return (patch.showIncome ?? before.showIncome) === false &&
    (patch.showOutcome ?? before.showOutcome) === false;
}
