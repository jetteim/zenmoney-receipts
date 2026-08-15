import { describe, expect, it } from "vitest";

import { buildExpenseDiff } from "../src/direct-write.js";

describe("ZenMoney direct receipt create payload", () => {
  it("includes the complete live transaction shape", () => {
    const request = buildExpenseDiff({
      id: "tx-new",
      changed: 123,
      serverTimestamp: 100,
      user: 7,
      accountId: "account-1",
      instrument: 2,
      amount: 1.25,
      tagIds: ["food"],
      merchant: null,
      payee: "Test shop",
      comment: "synthetic",
      date: "2026-08-15"
    });

    expect(request).toMatchObject({
      currentClientTimestamp: 123,
      serverTimestamp: 100,
      transaction: [
        {
          id: "tx-new",
          viewed: false,
          incomeBankID: null,
          outcomeBankID: null,
          qrCode: null,
          outcome: 1.25,
          tag: ["food"]
        }
      ]
    });
  });
});
