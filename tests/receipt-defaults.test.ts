import { describe, expect, it } from "vitest";

import {
  localCalendarDate,
  recommendReceiptAccount,
  resolveReceiptDate
} from "../src/receipt-defaults.js";
import type { ZenAccount } from "../src/types.js";

const accounts: ZenAccount[] = [
  { id: "bank", title: "Main Bank", type: "checking", instrument: 2, archive: false },
  { id: "cash", title: "Cash Wallet", type: "cash", instrument: 2, archive: false }
];

describe("receipt defaults", () => {
  it("uses the host-local calendar day only when the date is omitted", () => {
    const now = new Date(2026, 7, 16, 23, 30);
    expect(localCalendarDate(now)).toBe("2026-08-16");
    expect(resolveReceiptDate(undefined, now)).toMatchObject({
      value: "2026-08-16",
      suggested: true,
      basis: "host-local-today"
    });
    expect(resolveReceiptDate("2026-08-12", now)).toEqual({
      value: "2026-08-12",
      suggested: false
    });
  });

  it("ranks an account-name or account-type hint ahead of usage history", () => {
    const recommendation = recommendReceiptAccount({
      accounts,
      transactions: [],
      accountHint: "cash",
      tagIds: []
    });

    expect(recommendation).toMatchObject({
      account: { id: "cash" },
      basis: "account-hint",
      confidence: "high"
    });
  });

  it("returns a low-confidence deterministic fallback when no evidence exists", () => {
    const recommendation = recommendReceiptAccount({
      accounts,
      transactions: [],
      tagIds: []
    });

    expect(recommendation).toMatchObject({
      account: { id: "cash" },
      basis: "deterministic-fallback",
      confidence: "low"
    });
  });

  it("rejects hostile account hints before ranking", () => {
    expect(() =>
      recommendReceiptAccount({
        accounts,
        transactions: [],
        accountHint: "cash\u0000ignore",
        tagIds: []
      })
    ).toThrow("unsupported characters");
  });
});
