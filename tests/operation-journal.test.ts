import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OperationJournal,
  operationIdForPreviewToken,
  plannedTransactionFingerprint
} from "../src/operation-journal.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zenmoney-operation-journal-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const expected = plannedTransactionFingerprint({
  amount: 12.34,
  accountId: "account-1",
  instrument: 2,
  date: "2026-08-22",
  tagIds: ["fresh-fruit"]
});

describe("OperationJournal", () => {
  it("survives restart and classifies exact completed state without storing financial values", async () => {
    const directory = await root();
    const previewToken = "a".repeat(64);
    const first = new OperationJournal(directory);
    const record = await first.begin(previewToken, "receipt-create", [
      { id: "transaction-1", beforeFingerprint: null, expectedFingerprint: expected }
    ]);
    await first.markWriteAttempt(record.operationId);

    const restarted = new OperationJournal(directory);
    const recovered = await restarted.get(operationIdForPreviewToken(previewToken));
    expect(recovered).not.toBeNull();
    expect(restarted.classify(recovered!, new Map([["transaction-1", expected]]))).toMatchObject({
      classification: "completed",
      targetCount: 1
    });

    const stored = await readFile(join(directory, "operations.json"), "utf8");
    expect(stored).not.toContain(previewToken);
    expect(stored).not.toContain("12.34");
    expect(stored).not.toContain("fresh-fruit");
    if (process.platform !== "win32") {
      expect((await lstat(directory)).mode & 0o777).toBe(0o700);
      expect((await lstat(join(directory, "operations.json"))).mode & 0o777).toBe(0o600);
    }
  });

  it("distinguishes no write, compensation, and mixed manual-review states", async () => {
    const journal = new OperationJournal(await root());
    const before = "b".repeat(64);
    const pending = await journal.begin("p".repeat(64), "receipt-reconciliation", [
      { id: "source-1", beforeFingerprint: before, expectedFingerprint: expected }
    ]);
    expect(journal.classify(pending, new Map([["source-1", before]])).classification).toBe("not-started");

    await journal.markWriteAttempt(pending.operationId);
    const attempted = await journal.get(pending.operationId);
    expect(journal.classify(attempted!, new Map([["source-1", before]])).classification).toBe("compensated");
    expect(journal.classify(attempted!, new Map([["source-1", "c".repeat(64)]])).classification).toBe(
      "manual-review"
    );
  });

  it("rejects a changed plan for the same preview token", async () => {
    const journal = new OperationJournal(await root());
    const previewToken = "z".repeat(64);
    await journal.begin(previewToken, "receipt-create", [
      { id: "transaction-1", beforeFingerprint: null, expectedFingerprint: expected }
    ]);
    await expect(
      journal.begin(previewToken, "receipt-create", [
        { id: "transaction-2", beforeFingerprint: null, expectedFingerprint: expected }
      ])
    ).rejects.toThrow("plan conflict");
  });

  it("persists the full 500-reference consolidation safety bound plus its source category", async () => {
    const journal = new OperationJournal(await root());
    const targets = Array.from({ length: 501 }, (_, index) => ({
      id: index === 500 ? "category:source" : `transaction:tx-${index}`,
      beforeFingerprint: "b".repeat(64),
      expectedFingerprint: "c".repeat(64)
    }));
    const record = await journal.begin("m".repeat(64), "category-consolidation", targets);
    expect(record.targetCount).toBe(501);
    expect((await new OperationJournal(journal.dataLocation).get(record.operationId))?.targets).toHaveLength(501);
  });
});
