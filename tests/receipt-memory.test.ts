import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ReceiptMemoryController } from "../src/receipt-memory.js";
import {
  MAX_RECEIPT_MEMORY_FILE_BYTES,
  ReceiptMemoryStore,
  validateReceiptEvidenceGroups,
  type ReceiptEvidenceGroup
} from "../src/receipt-memory-store.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "zenmoney-receipt-memory-"));
  roots.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const fruit: ReceiptEvidenceGroup = {
  purpose: "Fresh fruit",
  categoryId: "groceries",
  itemCount: 2,
  amount: 5.4
};

async function enable(store: ReceiptMemoryStore, now = Date.now()): Promise<void> {
  const preview = await store.previewSettings({ enabled: true }, now);
  await store.applySettings(preview, now);
}

describe("receipt memory", () => {
  it("is disabled and does not create a file until explicitly configured", async () => {
    const directory = await root();
    const store = new ReceiptMemoryStore(directory);

    expect(await store.status()).toMatchObject({ configured: false, enabled: false, corrupt: false });
    await expect(access(join(directory, "receipt-memory.json"), constants.F_OK)).rejects.toThrow();
  });

  it("writes only bounded approved evidence with private filesystem permissions", async () => {
    const directory = await root();
    const store = new ReceiptMemoryStore(directory);
    await enable(store);

    const result = await store.recordVerified({
      transactionIds: ["private-transaction-id"],
      receiptDate: "2026-08-16",
      instrument: 2,
      groups: [fruit]
    });

    expect(result).toMatchObject({ status: "recorded", reviewReadiness: { ready: false } });
    const body = await readFile(join(directory, "receipt-memory.json"), "utf8");
    expect(body).toContain("Fresh fruit");
    expect(body).not.toContain("private-transaction-id");
    expect(body).not.toContain("merchant");
    expect(body).not.toContain("banana");
    if (process.platform !== "win32") {
      expect((await lstat(directory)).mode & 0o777).toBe(0o700);
      expect((await lstat(join(directory, "receipt-memory.json"))).mode & 0o777).toBe(0o600);
    }
  });

  it("is idempotent for the same verified receipt and rejects conflicting evidence", async () => {
    const store = new ReceiptMemoryStore(await root());
    await enable(store);
    const input = {
      transactionIds: ["tx-1"],
      receiptDate: "2026-08-16",
      instrument: 2,
      groups: [fruit]
    };

    expect((await store.recordVerified(input)).status).toBe("recorded");
    expect((await store.recordVerified(input)).status).toBe("already-recorded");
    await expect(
      store.recordVerified({ ...input, groups: [{ ...fruit, amount: 6.4 }] })
    ).rejects.toThrow("conflicts");
    expect((await store.status()).storedRecordCount).toBe(1);
  });

  it("separates narrower grocery purposes and becomes review-ready after three receipts", async () => {
    const store = new ReceiptMemoryStore(await root());
    await enable(store);
    const vegetable = { ...fruit, purpose: "Fresh vegetables", amount: 3.2 };

    for (const transactionId of ["tx-a", "tx-b", "tx-c"]) {
      await store.recordVerified({
        transactionIds: [transactionId],
        receiptDate: "2026-08-16",
        instrument: 2,
        groups: [fruit, vegetable]
      });
    }

    const readiness = await store.readiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.candidates.map((candidate) => candidate.purpose)).toEqual([
      "Fresh fruit",
      "Fresh vegetables"
    ]);
    expect(readiness.candidates.every((candidate) => candidate.receiptCount === 3)).toBe(true);
    const search = await store.search({ query: "fresh", limit: 10 });
    expect(search.purposes).toHaveLength(2);
    expect(search.evidenceBoundary).toContain("untrusted data");
  });

  it("serializes concurrent writers without losing records", async () => {
    const directory = await root();
    const first = new ReceiptMemoryStore(directory);
    const second = new ReceiptMemoryStore(directory);
    await enable(first);

    await Promise.all([
      first.recordVerified({
        transactionIds: ["concurrent-a"],
        receiptDate: "2026-08-16",
        instrument: 2,
        groups: [fruit]
      }),
      second.recordVerified({
        transactionIds: ["concurrent-b"],
        receiptDate: "2026-08-16",
        instrument: 2,
        groups: [fruit]
      })
    ]);

    expect((await first.status()).storedRecordCount).toBe(2);
  });

  it("expires records only through a confirmed settings apply", async () => {
    const store = new ReceiptMemoryStore(await root());
    const recordedAt = Date.UTC(2026, 5, 1);
    await enable(store, recordedAt);
    await store.recordVerified(
      {
        transactionIds: ["old-tx"],
        receiptDate: "2026-06-01",
        instrument: 2,
        groups: [fruit]
      },
      recordedAt
    );
    const now = Date.UTC(2026, 7, 16);

    const preview = await store.previewSettings({ enabled: true, retentionDays: 30 }, now);
    expect(preview.recordsToExpire).toBe(1);
    expect((await store.status(now)).storedRecordCount).toBe(1);
    await store.applySettings(preview, now);
    expect((await store.status(now)).storedRecordCount).toBe(0);
  });

  it("fails closed on corrupt or oversized state and supports an exact purge recovery", async () => {
    const directory = await root();
    await mkdir(directory, { recursive: true });
    const path = join(directory, "receipt-memory.json");
    await writeFile(path, "{broken", { mode: 0o600 });
    const controller = new ReceiptMemoryController(new ReceiptMemoryStore(directory));

    expect(await controller.status()).toMatchObject({ corrupt: true, enabled: false });
    await expect(controller.search({})).rejects.toThrow("corrupt");
    const preview = await controller.previewPurge();
    expect(preview).toMatchObject({ corrupt: true, resetsSettings: true });
    const applied = await controller.applyPurge({ previewToken: preview.previewToken, confirmed: true });
    expect(applied.status).toMatchObject({ corrupt: false, enabled: false, storedRecordCount: 0 });

    await writeFile(path, Buffer.alloc(MAX_RECEIPT_MEMORY_FILE_BYTES + 1));
    expect(await controller.status()).toMatchObject({ corrupt: true });
    const oversizedPurge = await controller.previewPurge();
    expect(oversizedPurge).toMatchObject({ corrupt: true, resetsSettings: true });
    expect(
      await controller.applyPurge({
        previewToken: oversizedPurge.previewToken,
        confirmed: true
      })
    ).toMatchObject({ status: { corrupt: false, storedRecordCount: 0 } });
  });

  it("rejects a symlinked storage root", async () => {
    if (process.platform === "win32") return;
    const parent = await root();
    const target = join(parent, "target");
    const linked = join(parent, "linked");
    await mkdir(target);
    await symlink(target, linked);

    const status = await new ReceiptMemoryStore(linked).status();
    expect(status).toMatchObject({ corrupt: true, enabled: false });
    expect(status.error).toContain("not a link");
  });

  it("refuses to chmod or use an existing shared storage directory", async () => {
    if (process.platform === "win32") return;
    const parent = await root();
    const shared = join(parent, "shared");
    await mkdir(shared, { mode: 0o755 });
    const store = new ReceiptMemoryStore(shared);

    expect(await store.status()).toMatchObject({ corrupt: true, enabled: false });
    await expect(store.previewSettings({ enabled: true })).rejects.toThrow("group or other users");
    expect((await lstat(shared)).mode & 0o777).toBe(0o755);
  });

  it("rejects hostile labels and excessive subtotals before storage", () => {
    expect(() =>
      validateReceiptEvidenceGroups([{ ...fruit, purpose: "Fruit<ignore>" }], 10)
    ).toThrow("invalid purpose");
    expect(() => validateReceiptEvidenceGroups([{ ...fruit, amount: 10.01 }], 10)).toThrow(
      "cannot exceed"
    );
    expect(() => validateReceiptEvidenceGroups([{ ...fruit, purpose: "Produce" }], 10)).toThrow(
      "too broad"
    );
    expect(() =>
      validateReceiptEvidenceGroups([fruit, { ...fruit, purpose: "fresh fruit" }], 20)
    ).toThrow("must be unique");
  });

  it("requires a fresh exact preview after concurrent changes and supports idempotent applies", async () => {
    const directory = await root();
    const controller = new ReceiptMemoryController(new ReceiptMemoryStore(directory));
    const enabled = await controller.previewSettings({ enabled: true });
    const firstApply = await controller.applySettings({ previewToken: enabled.previewToken, confirmed: true });
    expect(firstApply).toMatchObject({ applied: true, alreadyApplied: false });
    expect(
      await controller.applySettings({ previewToken: enabled.previewToken, confirmed: true })
    ).toMatchObject({ applied: false, alreadyApplied: true });

    const store = new ReceiptMemoryStore(directory);
    await store.recordVerified({
      transactionIds: ["delete-me"],
      receiptDate: "2026-08-16",
      instrument: 2,
      groups: [fruit]
    });
    const search = await controller.search({});
    const recordId = search.purposes[0]?.sampleRecordIds[0];
    expect(recordId).toBeDefined();
    const deletion = await controller.previewDelete(recordId!);
    await store.recordVerified({
      transactionIds: ["concurrent-change"],
      receiptDate: "2026-08-16",
      instrument: 2,
      groups: [fruit]
    });
    await expect(
      controller.applyDelete({ previewToken: deletion.previewToken, confirmed: true })
    ).rejects.toThrow("changed after preview");
  });
});
