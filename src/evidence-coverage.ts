import type { ZenTransaction } from "./types.js";

export function observedMonths(values: Array<string | null>) {
  const months = [...new Set(values.filter((value): value is string => value !== null).map(value => value.slice(0, 7)))].sort();
  return { observedMonths: months.slice(0, 120), observedMonthsTruncated: months.length > 120 };
}

export function transactionCoverage(transactions: ZenTransaction[], input: { dateFrom: string; dateTo: string }, limit: number) {
  const included = transactions.filter(t => !t.deleted && t.outcome > 0 && t.income <= 0);
  return {
    source: "bounded-zenmoney-transactions",
    requestedPeriod: { dateFrom: input.dateFrom, dateTo: input.dateTo },
    examinedCount: transactions.length,
    includedExpenseCount: included.length,
    excludedCount: transactions.length - included.length,
    sourceLimit: limit,
    possiblyTruncated: transactions.length >= limit,
    ...observedMonths(included.map(t => t.date)),
    completeShoppingHistory: false,
    missingPeriodsMean: "no-evidence-in-this-result-not-zero-spending"
  };
}
