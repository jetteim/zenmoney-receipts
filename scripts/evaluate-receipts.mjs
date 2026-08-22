#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const corpus = JSON.parse(await readFile(resolve(root, "evals/receipts/cases.json"), "utf8"));

const cents = (value) => Math.round(value * 100);
const exactGroups = (left, right) =>
  left.length === right.length &&
  left.every((group, index) =>
    group.purpose === right[index]?.purpose && cents(group.amount) === cents(right[index]?.amount)
  );

const failures = [];
let totalExact = 0;
let dateExact = 0;
let currencyExact = 0;
let groupExact = 0;
let ambiguityExact = 0;
let safeAllocation = 0;

for (const item of corpus.cases) {
  const { expected, candidate } = item;
  if (cents(expected.total) === cents(candidate.total)) totalExact += 1;
  else failures.push(`${item.id}: total mismatch`);
  if (expected.date === candidate.date) dateExact += 1;
  else failures.push(`${item.id}: date mismatch`);
  if (expected.currency === candidate.currency) currencyExact += 1;
  else failures.push(`${item.id}: currency mismatch`);
  if (exactGroups(expected.groups, candidate.groups)) groupExact += 1;
  else failures.push(`${item.id}: group mismatch`);
  if (expected.requiresClarification === candidate.requiresClarification) ambiguityExact += 1;
  else failures.push(`${item.id}: ambiguity mismatch`);
  const allocated = candidate.groups.reduce((sum, group) => sum + cents(group.amount), 0);
  const safe =
    candidate.groups.every(
      (group) =>
        typeof group.purpose === "string" &&
        group.purpose.length > 0 &&
        group.purpose.length <= 80 &&
        !/^(produce|groceries|food|other)$/i.test(group.purpose)
    ) &&
    allocated <= cents(candidate.total) &&
    (candidate.requiresClarification || allocated === cents(candidate.total));
  if (safe) safeAllocation += 1;
  else failures.push(`${item.id}: unsafe or incomplete unmarked allocation`);
}

const count = corpus.cases.length;
const metric = (value) => Number((value / count).toFixed(4));
const metrics = {
  totalExactAccuracy: metric(totalExact),
  dateDecisionAccuracy: metric(dateExact),
  currencyExactAccuracy: metric(currencyExact),
  purposeAllocationExactAccuracy: metric(groupExact),
  ambiguityDecisionAccuracy: metric(ambiguityExact),
  safeAllocationRate: metric(safeAllocation)
};
const thresholds = {
  totalExactAccuracy: 1,
  dateDecisionAccuracy: 1,
  currencyExactAccuracy: 1,
  purposeAllocationExactAccuracy: 1,
  ambiguityDecisionAccuracy: 1,
  safeAllocationRate: 1
};
const ok = Object.entries(thresholds).every(([name, threshold]) => metrics[name] >= threshold);
process.stdout.write(
  `${JSON.stringify({ schemaVersion: "1", command: "evaluate-receipts", ok, caseCount: count, metrics, thresholds, failures }, null, 2)}\n`
);
if (!ok) process.exitCode = 1;
