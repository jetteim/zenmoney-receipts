import { z } from "zod";

export const amountBasisSchema = z.enum(["unknown", "before-discounts", "after-discounts"]);
export const evidenceCoverageSchema = z.enum(["unknown", "partial", "complete"]);
const purpose = z.string().min(1).max(80).regex(/^[^\u0000-\u001f\u007f<>`]+$/).refine(value => value.trim() === value);

// Corrections cannot change money, category assignments, identity, or retention.
export const receiptMemoryCorrectionSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  corrections: z.array(z.object({
    recordId: z.string().regex(/^evi_[a-f0-9]{24}$/),
    amountBasis: amountBasisSchema.optional(),
    coverage: evidenceCoverageSchema.optional(),
    renames: z.array(z.object({ from: purpose, to: purpose }).strict()).min(1).max(10).optional()
  }).strict().refine(value => value.amountBasis !== undefined || value.coverage !== undefined || value.renames !== undefined))
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
    renames: [{ from: "exact existing purpose", to: "supported narrow purpose" }]
  }] },
  limits: { records: 1000, renamesPerRecord: 10, purposeCharacters: 80 },
  preview: "memory correct < request.json; no writes",
  apply: "memory correct --confirm --plan-digest DIGEST < request.json",
  boundary: "Local evidence only. Explicit caller-supported labels and metadata; no amount, category, identity, retention, or ZenMoney writes. Unknown historical price bases stay unknown."
};
