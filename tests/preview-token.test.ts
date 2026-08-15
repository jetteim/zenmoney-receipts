import { describe, expect, it } from "vitest";

import { PreviewTokenManager } from "../src/preview-token.js";

describe("PreviewTokenManager", () => {
  it("round-trips a signed preview", () => {
    const manager = new PreviewTokenManager(Buffer.alloc(32, 7));
    const preview = manager.create(
      { transactionId: "tx-1", expectedChanged: 42, tagIds: ["groceries"] },
      { now: 1_000, ttlMs: 10_000 }
    );

    expect(manager.verify(preview.token, 2_000)).toEqual({
      version: 1,
      transactionId: "tx-1",
      expectedChanged: 42,
      tagIds: ["groceries"],
      expiresAt: 11_000
    });
  });

  it("rejects tampering", () => {
    const manager = new PreviewTokenManager(Buffer.alloc(32, 7));
    const preview = manager.create({ transactionId: "tx-1", expectedChanged: 42, tagIds: ["food"] });
    const tampered = `${preview.token.slice(0, -1)}${preview.token.endsWith("a") ? "b" : "a"}`;

    expect(() => manager.verify(tampered)).toThrow("invalid");
  });

  it("rejects expired previews", () => {
    const manager = new PreviewTokenManager(Buffer.alloc(32, 7));
    const preview = manager.create(
      { transactionId: "tx-1", expectedChanged: 42, tagIds: ["food"] },
      { now: 1_000, ttlMs: 100 }
    );

    expect(() => manager.verify(preview.token, 1_101)).toThrow("expired");
  });
});
