import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PrivacySafeEventStore } from "../src/observability.js";
import { OperationJournal } from "../src/operation-journal.js";
import { ReceiptMemoryController } from "../src/receipt-memory.js";
import { ReceiptMemoryStore } from "../src/receipt-memory-store.js";
import { buildSupportBundle } from "../src/support-bundle.js";

const roots: string[] = [];

async function root(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("privacy-safe observability", () => {
  it("stores only allowlisted fields and hashes operation references", async () => {
    const directory = await root("zenmoney-events-");
    const store = new PrivacySafeEventStore(directory);
    const hostile = "receipt total 44.90 category Fresh fruit transaction tx-private bearer private-value";
    await store.emit({
      name: "operation.phase",
      component: "receipt-operation",
      operationKind: "receipt-create",
      operationId: hostile,
      phase: "write",
      outcome: "failed",
      code: hostile
    });

    const events = await store.recent();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ code: "invalid_code", operationRef: expect.stringMatching(/^[a-f0-9]{16}$/) });
    const body = await readFile(join(directory, "events.json"), "utf8");
    expect(body).not.toContain("44.90");
    expect(body).not.toContain("Fresh fruit");
    expect(body).not.toContain("tx-private");
    expect(body).not.toContain("private-value");
    if (process.platform !== "win32") {
      expect((await lstat(directory)).mode & 0o777).toBe(0o700);
      expect((await lstat(join(directory, "events.json"))).mode & 0o777).toBe(0o600);
    }
  });

  it("builds a bounded support bundle without paths, target ids, or event inputs", async () => {
    const journal = new OperationJournal(await root("zenmoney-support-journal-"));
    const events = new PrivacySafeEventStore(await root("zenmoney-support-events-"));
    const memory = new ReceiptMemoryController(
      new ReceiptMemoryStore(await root("zenmoney-support-memory-"))
    );
    const preview = "s".repeat(64);
    await journal.begin(preview, "receipt-create", [
      { id: "private-transaction-id", beforeFingerprint: null, expectedFingerprint: "a".repeat(64) }
    ]);
    await events.emit({
      name: "backend.call",
      component: "backend",
      phase: "read",
      outcome: "succeeded",
      code: "backend_read"
    });

    const bundle = await buildSupportBundle({ journal, events, memory, now: 123_456_789 });
    const serialized = JSON.stringify(bundle);
    expect(bundle.observability.events).toHaveLength(1);
    expect(bundle.recovery.recent).toHaveLength(1);
    expect(serialized).not.toContain("private-transaction-id");
    expect(serialized).not.toContain(preview);
    expect(serialized).not.toContain("zenmoney-support-");
    expect(serialized).not.toContain("dataLocation");
  });
});
