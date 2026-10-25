import { z } from "zod";

const money = z.number().finite().nonnegative().max(1_000_000_000)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7, "use at most two decimal places");
export const evidencePricingSchema = z.object({
  beforeDiscountTotal: money.refine(value => value > 0),
  discountTotal: money,
  coverage: z.enum(["complete", "partial"])
}).strict();
export type EvidencePricing = z.infer<typeof evidencePricingSchema>;

// Caller-supported receipt facts, not permission to change the financial amount.
export function evidenceLimit(paidTotal: number, input?: EvidencePricing): number {
  if (input === undefined) return paidTotal;
  const result = evidencePricingSchema.safeParse(input);
  if (!result.success || !money.safeParse(paidTotal).success || paidTotal <= 0)
    throw new Error("invalid evidence pricing");
  const pricing = result.data;
  if (Math.round(pricing.beforeDiscountTotal * 100) - Math.round(pricing.discountTotal * 100) !== Math.round(paidTotal * 100))
    throw new Error("evidence full price minus discounts must equal the paid receipt total");
  return pricing.beforeDiscountTotal;
}
