import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { ChildMcpBackend } from "../dist/backend.js";

function resultValue(response) {
  if (response.isError === true) {
    const message = response.content?.find((item) => item.type === "text")?.text;
    throw new Error(message || "MCP tool returned an error");
  }
  const structured = response.structuredContent?.result;
  if (structured !== undefined) return structured;
  const body = response.content?.find((item) => item.type === "text")?.text;
  return body ? JSON.parse(body) : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function collectPreviewIds(preview, knownIds) {
  for (const part of preview?.parts ?? []) knownIds.add(part.transactionId);
  for (const change of preview?.changes ?? []) {
    for (const part of change.parts ?? []) knownIds.add(part.transactionId);
  }
}

function requireApplied(result, label) {
  assert(result?.applied === true, `${label} was not applied`);
  assert(result?.verified === true, `${label} was not verified`);
  assert(Array.isArray(result?.transactionIds), `${label} returned no transaction ids`);
}

async function call(client, name, args) {
  return resultValue(await client.callTool({ name, arguments: args }));
}

async function cleanup(transactionIds) {
  if (transactionIds.size === 0) return { deleted: 0, total: 0 };
  const backend = new ChildMcpBackend();
  let deleted = 0;
  try {
    await backend.start();
    await backend.call("sync_run", { full: false });
    for (const transactionId of [...transactionIds].reverse()) {
      await backend.call("sync_run", { full: false });
      const current = await backend.call("transactions_get", { id: transactionId });
      if (!current || current.deleted === true) {
        deleted += 1;
        continue;
      }
      assert(typeof current.changed === "number", "cleanup transaction has no concurrency version");
      const result = await backend.call("transactions_delete", {
        id: transactionId,
        expectedChanged: current.changed
      });
      assert(result?.status === "applied", "cleanup delete was not applied");
      deleted += 1;
    }

    await backend.call("sync_run", { full: false });
    for (const transactionId of transactionIds) {
      const current = await backend.call("transactions_get", { id: transactionId });
      assert(!current || current.deleted === true, "cleanup verification found a live synthetic expense");
    }
    return { deleted, total: transactionIds.size };
  } finally {
    await backend.close();
  }
}

if (process.env.ZENMONEY_LIVE_WRITE_TEST !== "1") {
  throw new Error(
    "Refusing live writes. Set ZENMONEY_LIVE_WRITE_TEST=1 only after explicit authorization."
  );
}

const client = new Client({ name: "zenmoney-receipts-live-write-e2e", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] });
const knownIds = new Set();
const marker = `ZenMoney Receipts E2E ${new Date().toISOString()}`;
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
let connected = false;
let primaryError = null;
let cleanupError = null;

process.stdout.write("E2E scope: uniquely labeled synthetic expenses only; no pre-existing transaction will be changed.\n");

try {
  await client.connect(transport);
  connected = true;
  const status = await call(client, "zenmoney_connection_status", {});
  assert(status?.configured === true, "ZenMoney credential is not configured");
  await call(client, "zenmoney_sync", { full: false });

  const [accounts, categories] = await Promise.all([
    call(client, "zenmoney_list_accounts", { includeArchived: false }),
    call(client, "zenmoney_list_categories", { includeArchived: false })
  ]);
  const account = accounts.find(
    (candidate) =>
      candidate.archive !== true &&
      typeof candidate.instrument === "number" &&
      candidate.type !== "debt"
  );
  const selectedCategories = categories
    .filter((category) => category.archive !== true && category.parent !== null)
    .slice(0, 2);
  assert(account, "no active expense account with an instrument is available");
  assert(selectedCategories.length === 2, "two active child categories are required for the E2E");
  process.stdout.write("Preflight passed: credential, sync, writable account, and two active categories.\n");

  const newPreview = await call(client, "zenmoney_preview_new_receipt", {
    receiptTotal: 0.03,
    accountId: account.id,
    date,
    payee: marker,
    comment: `${marker}; synthetic create/split test; safe to delete`,
    parts: [
      { amount: 0.01, tagIds: [selectedCategories[0].id] },
      { amount: 0.02, tagIds: [selectedCategories[1].id] }
    ]
  });
  collectPreviewIds(newPreview, knownIds);
  assert(cents(newPreview?.receiptTotal) === 3, "new receipt preview total is not 0.03");
  assert(newPreview?.note === "No data has been changed.", "new receipt preview did not remain read-only");
  process.stdout.write("New-receipt preview passed: 0.01 + 0.02 = 0.03 and no write occurred.\n");

  const newApplied = await call(client, "zenmoney_apply_new_receipt", {
    previewToken: newPreview.previewToken,
    confirmed: true
  });
  requireApplied(newApplied, "new receipt");
  assert(
    newApplied.transactions.reduce((total, transaction) => total + cents(transaction.outcome), 0) === 3,
    "new receipt verification total is not 0.03"
  );
  const newRepeated = await call(client, "zenmoney_apply_new_receipt", {
    previewToken: newPreview.previewToken,
    confirmed: true
  });
  assert(newRepeated?.alreadyApplied === true, "new receipt repeat apply was not idempotent");
  process.stdout.write("New-receipt apply passed: verified total and repeat-apply idempotency.\n");

  const seedPreview = await call(client, "zenmoney_preview_new_receipt", {
    receiptTotal: 0.06,
    accountId: account.id,
    date,
    payee: marker,
    comment: `${marker}; synthetic reconciliation seed; safe to delete`,
    parts: [{ amount: 0.06, tagIds: [selectedCategories[0].id] }]
  });
  collectPreviewIds(seedPreview, knownIds);
  const seedApplied = await call(client, "zenmoney_apply_new_receipt", {
    previewToken: seedPreview.previewToken,
    confirmed: true
  });
  requireApplied(seedApplied, "reconciliation seed");
  const sourceId = seedApplied.transactionIds[0];

  const reconcilePreview = await call(client, "zenmoney_preview_receipt_reconciliation", {
    receiptTotal: 0.05,
    allocations: [
      {
        transactionId: sourceId,
        parts: [
          { amount: 0.02, tagIds: [selectedCategories[0].id] },
          { amount: 0.03, tagIds: [selectedCategories[1].id] }
        ]
      }
    ]
  });
  collectPreviewIds(reconcilePreview, knownIds);
  assert(cents(reconcilePreview?.sourceTotal) === 6, "reconciliation source total is not 0.06");
  assert(cents(reconcilePreview?.allocatedTotal) === 5, "reconciliation target total is not 0.05");
  assert(cents(reconcilePreview?.totalCorrection) === -1, "reconciliation correction is not -0.01");
  process.stdout.write("Reconciliation preview passed: 0.06 -> 0.02 + 0.03 = 0.05 and no write occurred.\n");

  const reconciled = await call(client, "zenmoney_apply_receipt_reconciliation", {
    previewToken: reconcilePreview.previewToken,
    confirmed: true
  });
  requireApplied(reconciled, "receipt reconciliation");
  assert(
    reconciled.transactions.reduce((total, transaction) => total + cents(transaction.outcome), 0) === 5,
    "reconciliation verification total is not 0.05"
  );
  const reconcileRepeated = await call(client, "zenmoney_apply_receipt_reconciliation", {
    previewToken: reconcilePreview.previewToken,
    confirmed: true
  });
  assert(reconcileRepeated?.alreadyApplied === true, "reconciliation repeat apply was not idempotent");
  process.stdout.write("Reconciliation apply passed: amount correction, split, categories, total, and idempotency verified.\n");
} catch (error) {
  primaryError = error;
} finally {
  if (connected) {
    try {
      await client.close();
    } catch (error) {
      primaryError ??= error;
    }
  }
  try {
    const cleaned = await cleanup(knownIds);
    process.stdout.write(
      `Cleanup passed: ${cleaned.deleted}/${cleaned.total} exact synthetic transaction IDs are absent or deleted.\n`
    );
  } catch (error) {
    cleanupError = error;
    process.stderr.write(
      `CLEANUP FAILED for synthetic IDs: ${[...knownIds].join(", ")}\n`
    );
  }
}

if (cleanupError) throw cleanupError;
if (primaryError) throw primaryError;
process.stdout.write("Live write E2E passed. No pre-existing transaction was changed.\n");
