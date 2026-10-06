import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "zenmoney-correction-cli-"));
const run = (args, input = "") => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "memory", ...args], {
    input, encoding: "utf8", timeout: 15000,
    env: { ...process.env, ZENMONEY_RECEIPT_MEMORY_DIR: directory }
  });
  assert.equal(result.error, undefined);
  return { status: result.status, output: JSON.parse(result.stdout) };
};
try {
  const recordId = `evi_${"a".repeat(24)}`;
  const file = join(directory, "receipt-memory.json");
  await writeFile(file, JSON.stringify({ schemaVersion: 1, revision: 2, enabled: true, retentionDays: 180, records: [{
    id: recordId, receiptKey: "a".repeat(64), recordedAt: new Date().toISOString(), receiptMonth: "2026-09", instrument: 1,
    groups: [{ purpose: "Cold cuts", categoryId: "synthetic-food", itemCount: 1, amount: 3 }]
  }] }), { mode: 0o600 });
  const request = JSON.stringify({ expectedRevision: 2, corrections: [{ recordId, amountBasis: "before-discounts", coverage: "complete", renames: [{ from: "Cold cuts", to: "Processed meat" }] }] });
  const before = await readFile(file, "utf8");
  const preview = run(["correct"], request);
  assert.equal(preview.status, 0);
  assert.equal(await readFile(file, "utf8"), before);
  for (const [args, input] of [
    [["correct"], "{secret-canary-invalid"],
    [["correct", "--confirm"], request],
    [["correct", "--confirm", "--plan-digest", "b".repeat(64)], request],
    [["correct"], " ".repeat(262145)],
    [["correct"], request.replace('"complete"', '"invented"')]
  ]) {
    const failure = run(args, input);
    assert.notEqual(failure.status, 0);
    assert.equal(failure.output.ok, false);
    assert.ok(!JSON.stringify(failure.output).includes("secret-canary"));
    assert.equal(await readFile(file, "utf8"), before);
  }
  const applied = run(["correct", "--confirm", "--plan-digest", preview.output.result.planDigest], request);
  assert.equal(applied.status, 0);
  assert.equal(applied.output.result.verified, true);
  assert.equal(run(["search"]).output.result.purposes[0].amountBasis, "before-discounts");
  assert.notEqual(run(["correct", "--confirm", "--plan-digest", preview.output.result.planDigest], request).status, 0);
  console.log("Receipt-memory correction CLI: synthetic preview, apply, replay, bounds and error checks passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
