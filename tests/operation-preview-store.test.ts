import { describe, expect, it } from "vitest";

import { OperationPreviewStore } from "../src/operation-preview-store.js";

describe("OperationPreviewStore", () => {
  it("binds one plan to one idempotent result", () => {
    const store = new OperationPreviewStore<{ value: number }, { verified: boolean }>();
    const preview = store.create({ value: 7 }, { now: 100, ttlMs: 1_000 });

    expect(store.begin(preview.previewToken, 101)).toEqual({
      state: "pending",
      plan: { value: 7 }
    });
    store.markApplied(preview.previewToken, { verified: true });
    expect(store.begin(preview.previewToken, 102)).toEqual({
      state: "applied",
      result: { verified: true }
    });
  });

  it("expires previews and locks an operation after incomplete rollback", () => {
    const store = new OperationPreviewStore<string, string>();
    const expired = store.create("plan", { now: 100, ttlMs: 5 });
    expect(() => store.begin(expired.previewToken, 106)).toThrow("expired");

    const failed = store.create("plan", { now: 200, ttlMs: 100 });
    store.begin(failed.previewToken, 201);
    store.markFailed(failed.previewToken, "manual inspection required");
    expect(() => store.begin(failed.previewToken, 202)).toThrow("manual inspection required");
  });
});
