import { expect, it } from "vitest";
import { observedMonths, transactionCoverage } from "../src/evidence-coverage.js";
import type { ZenTransaction } from "../src/types.js";

it("separates excluded records and bounded history without inferring zero-spend months", () => {
  const expense = { deleted: false, income: 0, outcome: 3, date: "2026-01-10" } as ZenTransaction;
  const period = { dateFrom: "2026-01-01", dateTo: "2026-03-31" };
  const result = transactionCoverage([expense, { ...expense, income: 3 }], period, 2);
  expect(result).toMatchObject({ examinedCount: 2, includedExpenseCount: 1, excludedCount: 1, possiblyTruncated: true, observedMonths: ["2026-01"], completeShoppingHistory: false });
  expect(transactionCoverage([], period, 500)).toMatchObject({ observedMonths: [], completeShoppingHistory: false, possiblyTruncated: false });
});

it("bounds observed month metadata", () => {
  const result = observedMonths(Array.from({ length: 121 }, (_, i) => `${1900 + i}-01-01`));
  expect(result.observedMonths).toHaveLength(120);
  expect(result.observedMonthsTruncated).toBe(true);
});
