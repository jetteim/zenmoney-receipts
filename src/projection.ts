import type { ZenAccount, ZenTag, ZenTransaction } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function safeText(value: unknown, maxLength = 300): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteNumber(value: unknown): number {
  return nullableNumber(value) ?? 0;
}

function nullableId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return null;
}

function idArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map(String)
    .slice(0, 5);
}

export function projectAccounts(value: unknown): ZenAccount[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 100).flatMap((item) => {
    const record = asRecord(item);
    const id = nullableId(record.id);
    if (!id) return [];
    return [
      {
        id,
        title: safeText(record.title, 120) ?? "Untitled account",
        type: safeText(record.type, 60),
        instrument: nullableNumber(record.instrument),
        archive: record.archive === true
      }
    ];
  });
}

export function projectTags(value: unknown): ZenTag[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 500).flatMap((item) => {
    const record = asRecord(item);
    const id = nullableId(record.id);
    if (!id) return [];
    return [
      {
        id,
        title: safeText(record.title, 120) ?? "Untitled category",
        parent: nullableId(record.parent),
        archive: record.archive === true
      }
    ];
  });
}

export function projectTransactions(value: unknown): ZenTransaction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 500).flatMap((item) => {
    const record = asRecord(item);
    const id = nullableId(record.id);
    if (!id) return [];
    return [
      {
        id,
        changed: nullableNumber(record.changed),
        date: safeText(record.date, 10),
        incomeAccount: nullableId(record.incomeAccount),
        outcomeAccount: nullableId(record.outcomeAccount),
        income: finiteNumber(record.income),
        outcome: finiteNumber(record.outcome),
        incomeInstrument: nullableNumber(record.incomeInstrument),
        outcomeInstrument: nullableNumber(record.outcomeInstrument),
        opOutcome: nullableNumber(record.opOutcome),
        opOutcomeInstrument: nullableNumber(record.opOutcomeInstrument),
        tag: idArray(record.tag),
        merchant: safeText(record.merchant, 120),
        payee: safeText(record.payee, 200),
        comment: safeText(record.comment, 300),
        hold: record.hold === true,
        deleted: record.deleted === true
      }
    ];
  });
}

export function projectTransaction(value: unknown): ZenTransaction | null {
  return projectTransactions([value])[0] ?? null;
}
