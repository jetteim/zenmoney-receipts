import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { ZenTransaction } from "./types.js";

const SCHEMA_VERSION = 1;
const MAX_RECORDS = 200;
const MAX_TARGETS = 501;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const RETENTION_MS = 30 * 86_400_000;

export type JournalOperationKind =
  | "receipt-category"
  | "receipt-reconciliation"
  | "receipt-create"
  | "category-consolidation";

export type JournalPhase =
  | "applying"
  | "verifying"
  | "completed"
  | "compensated"
  | "manual-review";

export interface JournalTarget {
  id: string;
  beforeFingerprint: string | null;
  expectedFingerprint: string | null;
}

export interface OperationJournalRecord {
  operationId: string;
  tokenDigest: string;
  kind: JournalOperationKind;
  planDigest: string;
  createdAt: string;
  updatedAt: string;
  phase: JournalPhase;
  writeAttempts: number;
  targetCount: number;
  targets: JournalTarget[];
  failureCode: string | null;
}

interface JournalState {
  schemaVersion: 1;
  revision: number;
  records: OperationJournalRecord[];
}

export interface RecoveryClassification {
  operationId: string;
  kind: JournalOperationKind;
  classification: "not-started" | "completed" | "compensated" | "manual-review";
  journalPhase: JournalPhase;
  targetCount: number;
  guidance: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{12,80}$/.test(value);
}

function validFingerprint(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function parseState(value: unknown): JournalState {
  if (typeof value !== "object" || value === null) throw new Error("operation journal is corrupt");
  const state = value as Record<string, unknown>;
  if (
    state.schemaVersion !== SCHEMA_VERSION ||
    !Number.isInteger(state.revision) ||
    !Array.isArray(state.records) ||
    state.records.length > MAX_RECORDS
  ) {
    throw new Error("operation journal is corrupt or uses an unsupported schema");
  }
  for (const candidate of state.records) {
    if (typeof candidate !== "object" || candidate === null) throw new Error("operation journal is corrupt");
    const record = candidate as Record<string, unknown>;
    if (
      !validId(record.operationId) ||
      !validFingerprint(record.tokenDigest) ||
      !validFingerprint(record.planDigest) ||
      !["receipt-category", "receipt-reconciliation", "receipt-create", "category-consolidation"].includes(
        String(record.kind)
      ) ||
      !["applying", "verifying", "completed", "compensated", "manual-review"].includes(
        String(record.phase)
      ) ||
      typeof record.createdAt !== "string" ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      typeof record.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      !Number.isInteger(record.writeAttempts) ||
      (record.writeAttempts as number) < 0 ||
      !Number.isInteger(record.targetCount) ||
      !Array.isArray(record.targets) ||
      record.targets.length !== record.targetCount ||
      record.targets.length > MAX_TARGETS ||
      !record.targets.every((target) => {
        if (typeof target !== "object" || target === null) return false;
        const item = target as Record<string, unknown>;
        return (
          typeof item.id === "string" &&
          /^[A-Za-z0-9._:-]{1,200}$/.test(item.id) &&
          validFingerprint(item.beforeFingerprint) &&
          validFingerprint(item.expectedFingerprint)
        );
      }) ||
      !(record.failureCode === null || (typeof record.failureCode === "string" && /^[a-z0-9._-]{1,80}$/.test(record.failureCode)))
    ) {
      throw new Error("operation journal is corrupt");
    }
  }
  return state as unknown as JournalState;
}

function defaultState(): JournalState {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, records: [] };
}

export function defaultOperationJournalDirectory(): string {
  const override = process.env.ZENMONEY_OPERATION_JOURNAL_DIR?.trim();
  if (override) return resolve(override);
  if (process.env.VITEST) return resolve(tmpdir(), `zenmoney-receipts-journal-${process.pid}`);
  const base =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
        : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return resolve(base, "zenmoney-receipts", "operation-journal");
}

export function operationIdForPreviewToken(previewToken: string): string {
  return `op_${sha256(previewToken).slice(0, 32)}`;
}

export function transactionFingerprint(
  transaction: Pick<
    ZenTransaction,
    "outcome" | "outcomeAccount" | "outcomeInstrument" | "date" | "tag" | "deleted"
  > | null
): string | null {
  if (!transaction || transaction.deleted) return null;
  return sha256(
    canonical({
      outcomeCents: Math.round(transaction.outcome * 100),
      outcomeAccount: transaction.outcomeAccount,
      outcomeInstrument: transaction.outcomeInstrument,
      date: transaction.date,
      tag: [...transaction.tag].sort()
    })
  );
}

export function plannedTransactionFingerprint(input: {
  amount: number;
  accountId: string;
  instrument: number;
  date: string;
  tagIds: string[];
}): string {
  return sha256(
    canonical({
      outcomeCents: Math.round(input.amount * 100),
      outcomeAccount: input.accountId,
      outcomeInstrument: input.instrument,
      date: input.date,
      tag: [...input.tagIds].sort()
    })
  );
}

export class OperationJournal {
  readonly dataLocation: string;
  private readonly statePath: string;
  private tail: Promise<void> = Promise.resolve();

  constructor(rootDirectory = defaultOperationJournalDirectory()) {
    this.dataLocation = resolve(rootDirectory);
    this.statePath = join(this.dataLocation, "operations.json");
  }

  async begin(
    previewToken: string,
    kind: JournalOperationKind,
    targets: JournalTarget[],
    now = Date.now()
  ): Promise<OperationJournalRecord> {
    if (targets.length < 1 || targets.length > MAX_TARGETS) throw new Error("operation journal target count is invalid");
    const tokenDigest = sha256(previewToken);
    const operationId = operationIdForPreviewToken(previewToken);
    const normalized = targets.map((target) => ({ ...target }));
    const planDigest = sha256(canonical({ kind, targets: normalized }));
    return this.mutate((state) => {
      const existing = state.records.find((record) => record.operationId === operationId);
      if (existing) {
        if (existing.tokenDigest !== tokenDigest || existing.planDigest !== planDigest || existing.kind !== kind) {
          throw new Error("operation journal plan conflict");
        }
        return existing;
      }
      const timestamp = new Date(now).toISOString();
      const record: OperationJournalRecord = {
        operationId,
        tokenDigest,
        kind,
        planDigest,
        createdAt: timestamp,
        updatedAt: timestamp,
        phase: "applying",
        writeAttempts: 0,
        targetCount: normalized.length,
        targets: normalized,
        failureCode: null
      };
      state.records.push(record);
      return record;
    }, now);
  }

  async markWriteAttempt(operationId: string, now = Date.now()): Promise<void> {
    await this.update(operationId, (record) => {
      if (["completed", "compensated", "manual-review"].includes(record.phase)) {
        throw new Error("operation journal record is terminal");
      }
      record.phase = "applying";
      record.writeAttempts += 1;
    }, now);
  }

  async markVerifying(operationId: string, now = Date.now()): Promise<void> {
    await this.update(operationId, (record) => {
      if (["completed", "compensated", "manual-review"].includes(record.phase)) {
        throw new Error("operation journal record is terminal");
      }
      record.phase = "verifying";
    }, now);
  }

  async markCompleted(operationId: string, now = Date.now()): Promise<void> {
    await this.update(operationId, (record) => {
      record.phase = "completed";
      record.failureCode = null;
    }, now);
  }

  async markCompensated(operationId: string, failureCode = "apply_failed", now = Date.now()): Promise<void> {
    await this.update(operationId, (record) => {
      record.phase = "compensated";
      record.failureCode = failureCode;
    }, now);
  }

  async markManualReview(operationId: string, failureCode = "uncertain_state", now = Date.now()): Promise<void> {
    await this.update(operationId, (record) => {
      record.phase = "manual-review";
      record.failureCode = failureCode;
    }, now);
  }

  async get(operationId: string): Promise<OperationJournalRecord | null> {
    const state = await this.read();
    return state.records.find((record) => record.operationId === operationId) ?? null;
  }

  async list(limit = 20): Promise<Array<Omit<OperationJournalRecord, "targets" | "tokenDigest" | "planDigest">>> {
    const bounded = Math.max(1, Math.min(limit, 50));
    const state = await this.read();
    return [...state.records]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, bounded)
      .map(({ targets: _targets, tokenDigest: _tokenDigest, planDigest: _planDigest, ...record }) => record);
  }

  classify(record: OperationJournalRecord, actualFingerprints: Map<string, string | null>): RecoveryClassification {
    const actual = record.targets.map((target) => actualFingerprints.get(target.id) ?? null);
    const completed = record.targets.every((target, index) => actual[index] === target.expectedFingerprint);
    const before = record.targets.every((target, index) => actual[index] === target.beforeFingerprint);
    let classification: RecoveryClassification["classification"];
    if (completed) classification = "completed";
    else if (before && record.writeAttempts === 0) classification = "not-started";
    else if (before) classification = "compensated";
    else classification = "manual-review";
    return {
      operationId: record.operationId,
      kind: record.kind,
      classification,
      journalPhase: record.phase,
      targetCount: record.targetCount,
      guidance:
        classification === "completed"
          ? "The exact planned target state is present. Do not repeat the write."
          : classification === "not-started"
            ? "No planned target change is visible. Create a fresh preview before trying again."
            : classification === "compensated"
              ? "The pre-operation state is restored. Create a fresh preview before trying again."
              : "Observed state matches neither the complete nor pre-operation fingerprint. Review the exact target records before any new write."
    };
  }

  private async update(
    operationId: string,
    updater: (record: OperationJournalRecord) => void,
    now: number
  ): Promise<void> {
    await this.mutate((state) => {
      const record = state.records.find((candidate) => candidate.operationId === operationId);
      if (!record) throw new Error("operation journal record was not found");
      updater(record);
      record.updatedAt = new Date(now).toISOString();
    }, now);
  }

  private async mutate<T>(mutation: (state: JournalState) => T, now: number): Promise<T> {
    let result!: T;
    const run = this.tail.then(async () => {
      const state = await this.read();
      state.records = state.records.filter((record) => Date.parse(record.updatedAt) >= now - RETENTION_MS);
      result = mutation(state);
      state.records = state.records.slice(-MAX_RECORDS);
      state.revision += 1;
      while (
        state.records.length > 1 &&
        Buffer.byteLength(`${JSON.stringify(state)}\n`) > MAX_FILE_BYTES
      ) {
        state.records.shift();
      }
      await this.write(state);
    });
    this.tail = run.then(() => undefined, () => undefined);
    await run;
    return result;
  }

  private async read(): Promise<JournalState> {
    try {
      const stat = await lstat(this.statePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("operation journal path must be a regular file");
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("operation journal must not be accessible by group or other users");
      }
      if (stat.size > MAX_FILE_BYTES) throw new Error("operation journal exceeds its size limit");
      return parseState(JSON.parse(await readFile(this.statePath, "utf8")) as unknown);
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
        return defaultState();
      }
      throw error;
    }
  }

  private async write(state: JournalState): Promise<void> {
    await this.ensureDirectory();
    const body = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(body) > MAX_FILE_BYTES) throw new Error("operation journal exceeds its size limit");
    const temporary = join(this.dataLocation, `.operations-${process.pid}-${Date.now()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.statePath);
    if (process.platform !== "win32") await chmod(this.statePath, 0o600);
    const directory = await open(this.dataLocation, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async ensureDirectory(): Promise<void> {
    try {
      const stat = await lstat(this.dataLocation);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("operation journal directory must be a real directory");
      }
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("operation journal directory must not be accessible by group or other users");
      }
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
        await mkdir(this.dataLocation, { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") await chmod(this.dataLocation, 0o700);
        return;
      }
      throw error;
    }
  }
}
