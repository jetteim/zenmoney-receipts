import { describe, expect, it } from "vitest";

import { rankReceiptMatches, shiftDate } from "../src/receipt.js";
import type { ZenTransaction } from "../src/types.js";

function transaction(overrides: Partial<ZenTransaction> = {}): ZenTransaction {
  return {
    id: "tx-1",
    changed: 10,
    date: "2026-08-14",
    incomeAccount: null,
    outcomeAccount: "account-1",
    income: 0,
    outcome: 12.5,
    incomeInstrument: null,
    outcomeInstrument: 2,
    opOutcome: null,
    opOutcomeInstrument: null,
    tag: [],
    merchant: null,
    payee: "Mercado Central Lisboa",
    comment: null,
    deleted: false,
    ...overrides
  };
}

describe("rankReceiptMatches", () => {
  it("ranks an exact amount, date, account, and merchant match highly", () => {
    const matches = rankReceiptMatches(
      { date: "2026-08-14", total: 12.5, merchant: "Mercado Central", accountId: "account-1" },
      [transaction()]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.score).toBeGreaterThanOrEqual(100);
    expect(matches[0]?.transaction.id).toBe("tx-1");
  });

  it("rejects wrong amounts, deleted entries, transfers, and the wrong requested account", () => {
    const matches = rankReceiptMatches(
      { date: "2026-08-14", total: 12.5, accountId: "account-1" },
      [
        transaction({ id: "wrong-amount", outcome: 20 }),
        transaction({ id: "deleted", deleted: true }),
        transaction({ id: "transfer", income: 12.5 }),
        transaction({ id: "wrong-account", outcomeAccount: "account-2" })
      ]
    );

    expect(matches).toEqual([]);
  });

  it("can match the original operation amount for a foreign-currency receipt", () => {
    const matches = rankReceiptMatches(
      { date: "2026-08-14", total: 10, currency: "USD" },
      [transaction({ outcome: 9.2, opOutcome: 10, opOutcomeInstrument: 1 })]
    );

    expect(matches[0]?.reasons).toContain("exact receipt-currency amount");
  });
});

describe("shiftDate", () => {
  it("uses UTC calendar arithmetic across month boundaries", () => {
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => shiftDate("2026-02-30", 0)).toThrow("valid calendar day");
  });
});
