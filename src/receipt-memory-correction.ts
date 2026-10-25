import { evidencePricingSchema } from "./receipt-evidence-pricing.js";
import { z } from "zod";

export const amountBasisSchema = z.enum(["unknown", "before-discounts", "after-discounts"]);
export const evidenceCoverageSchema = z.enum(["unknown", "partial", "complete"]);
const purpose = z.string().min(1).max(80).regex(/^[^\u0000-\u001f\u007f<>`]+$/).refine(value => value.trim() === value);

// Corrections preserve existing groups, identity and retention; completion can append missing groups.
export const receiptMemoryCorrectionSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  corrections: z.array(z.object({
    recordId: z.string().regex(/^evi_[a-f0-9]{24}$/),
    amountBasis: amountBasisSchema.optional(),
    coverage: evidenceCoverageSchema.optional(),
    completion: z.object({
      paidTotal: z.number().positive(),
      pricing: evidencePricingSchema,
      appendGroups: z.array(z.object({ purpose, categoryId: z.string().min(1).max(200),
        amount: z.number().positive(), itemCount: z.number().int().min(1).max(100) }).strict()).min(1).max(10)
    }).strict().optional(),
    renames: z.array(z.object({ from: purpose, to: purpose }).strict()).min(1).max(10).optional()
  }).strict().refine(value => value.amountBasis !== undefined || value.coverage !== undefined || value.renames !== undefined || value.completion !== undefined))
    .min(1).max(1000)
}).strict();

export type ReceiptMemoryCorrection = z.infer<typeof receiptMemoryCorrectionSchema>;
export type AmountBasis = z.infer<typeof amountBasisSchema>;
export type EvidenceCoverage = z.infer<typeof evidenceCoverageSchema>;

export const correctionContract = {
  command: "memory.correct",
  input: "bounded JSON on stdin (maximum 262144 bytes)",
  schema: { expectedRevision: "nonnegative integer", corrections: [{
    recordId: "evi_ plus 24 lowercase hex characters",
    amountBasis: amountBasisSchema.options,
    coverage: evidenceCoverageSchema.options,
    renames: [{ from: "exact existing purpose", to: "supported narrow purpose" }],
    completion: { paidTotal: "positive receipt paid total", pricing: {
      beforeDiscountTotal: "positive full-price total", discountTotal: "nonnegative discounts", coverage: "complete"
    }, appendGroups: [{ purpose: "missing narrow purpose", categoryId: "category already present in record", amount: "positive amount", itemCount: "integer 1..100" }] }
  }] },
  limits: { records: 1000, renamesPerRecord: 10, appendedGroupsPerRecord: 10, purposeCharacters: 80 },
  preview: "memory correct < request.json; no writes",
  apply: "memory correct --confirm --plan-digest DIGEST < request.json",
  boundary: "Local evidence only. Explicit caller-supported labels and metadata; no changes to existing group amounts/categories, identity, retention, or ZenMoney. Completion appends missing groups only under reconciled full-price totals. Unknown historical price bases stay unknown."
};
