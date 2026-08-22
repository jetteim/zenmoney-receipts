import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCHEMA_VERSION = 1;
const MAX_EVENTS = 500;
const MAX_FILE_BYTES = 512 * 1024;

export type OperationalEventName =
  | "backend.call"
  | "operation.phase"
  | "server.lifecycle"
  | "oauth.lifecycle";

export type OperationalOutcome = "started" | "succeeded" | "failed" | "uncertain";

export interface OperationalEvent {
  schemaVersion: 1;
  timestamp: string;
  name: OperationalEventName;
  outcome: OperationalOutcome;
  component: "backend" | "receipt-operation" | "taxonomy-operation" | "hosted-http" | "oauth";
  phase:
    | "start"
    | "read"
    | "write"
    | "verify"
    | "compensate"
    | "complete"
    | "shutdown";
  operationKind:
    | "none"
    | "receipt-category"
    | "receipt-reconciliation"
    | "receipt-create"
    | "category-consolidation";
  operationRef: string | null;
  durationMs: number | null;
  code: string;
}

interface EventState {
  schemaVersion: 1;
  revision: number;
  events: OperationalEvent[];
}

export interface EventInput {
  name: OperationalEventName;
  outcome: OperationalOutcome;
  component: OperationalEvent["component"];
  phase: OperationalEvent["phase"];
  operationKind?: OperationalEvent["operationKind"];
  operationId?: string;
  durationMs?: number;
  code: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeCode(value: string): string {
  if (!/^[a-z][a-z0-9._-]{0,79}$/.test(value)) return "invalid_code";
  return value;
}

function defaultState(): EventState {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, events: [] };
}

function parseState(value: unknown): EventState {
  if (typeof value !== "object" || value === null) throw new Error("operational event store is corrupt");
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== SCHEMA_VERSION ||
    !Number.isInteger(record.revision) ||
    !Array.isArray(record.events) ||
    record.events.length > MAX_EVENTS
  ) {
    throw new Error("operational event store is corrupt or uses an unsupported schema");
  }
  for (const candidate of record.events) {
    if (typeof candidate !== "object" || candidate === null) throw new Error("operational event store is corrupt");
    const event = candidate as Record<string, unknown>;
    if (
      event.schemaVersion !== SCHEMA_VERSION ||
      typeof event.timestamp !== "string" ||
      !Number.isFinite(Date.parse(event.timestamp)) ||
      !["backend.call", "operation.phase", "server.lifecycle", "oauth.lifecycle"].includes(String(event.name)) ||
      !["started", "succeeded", "failed", "uncertain"].includes(String(event.outcome)) ||
      !["backend", "receipt-operation", "taxonomy-operation", "hosted-http", "oauth"].includes(
        String(event.component)
      ) ||
      !["start", "read", "write", "verify", "compensate", "complete", "shutdown"].includes(
        String(event.phase)
      ) ||
      !["none", "receipt-category", "receipt-reconciliation", "receipt-create", "category-consolidation"].includes(
        String(event.operationKind)
      ) ||
      !(event.operationRef === null || (typeof event.operationRef === "string" && /^[a-f0-9]{16}$/.test(event.operationRef))) ||
      !(event.durationMs === null || (typeof event.durationMs === "number" && event.durationMs >= 0 && event.durationMs <= 86_400_000)) ||
      typeof event.code !== "string" ||
      safeCode(event.code) !== event.code
    ) {
      throw new Error("operational event store is corrupt");
    }
  }
  return record as unknown as EventState;
}

export function defaultOperationalEventDirectory(): string {
  const override = process.env.ZENMONEY_OPERATIONAL_EVENT_DIR?.trim();
  if (override) return resolve(override);
  if (process.env.VITEST) return resolve(tmpdir(), `zenmoney-receipts-events-${process.pid}`);
  const base =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
        : process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return resolve(base, "zenmoney-receipts", "operational-events");
}

export class PrivacySafeEventStore {
  readonly dataLocation: string;
  private readonly statePath: string;
  private tail: Promise<void> = Promise.resolve();

  constructor(rootDirectory = defaultOperationalEventDirectory()) {
    this.dataLocation = resolve(rootDirectory);
    this.statePath = join(this.dataLocation, "events.json");
  }

  async emit(input: EventInput, now = Date.now()): Promise<void> {
    const event: OperationalEvent = {
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date(now).toISOString(),
      name: input.name,
      outcome: input.outcome,
      component: input.component,
      phase: input.phase,
      operationKind: input.operationKind ?? "none",
      operationRef: input.operationId ? sha256(input.operationId).slice(0, 16) : null,
      durationMs:
        input.durationMs === undefined
          ? null
          : Math.max(0, Math.min(86_400_000, Math.round(input.durationMs))),
      code: safeCode(input.code)
    };
    const run = this.tail.then(async () => {
      const state = await this.read();
      state.events.push(event);
      state.events = state.events.slice(-MAX_EVENTS);
      state.revision += 1;
      await this.write(state);
    });
    this.tail = run.then(() => undefined, () => undefined);
    await run;
  }

  async recent(limit = 100): Promise<OperationalEvent[]> {
    const bounded = Math.max(1, Math.min(limit, 100));
    try {
      const state = await this.read();
      return state.events.slice(-bounded);
    } catch {
      return [];
    }
  }

  async status(): Promise<{
    available: boolean;
    configured: boolean;
    eventCount: number;
    maxEvents: number;
    privacy: string;
  }> {
    try {
      const state = await this.read();
      return {
        available: true,
        configured: state.revision > 0,
        eventCount: state.events.length,
        maxEvents: MAX_EVENTS,
        privacy:
          "Allowlisted operational fields only; no credentials, receipt text, amounts, categories, transaction ids, tenant ids, paths, or raw errors."
      };
    } catch {
      return {
        available: false,
        configured: true,
        eventCount: 0,
        maxEvents: MAX_EVENTS,
        privacy: "Operational events are unavailable because the private local store failed validation."
      };
    }
  }

  private async read(): Promise<EventState> {
    try {
      const stat = await lstat(this.statePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("operational event path must be a regular file");
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("operational event file must not be accessible by group or other users");
      }
      if (stat.size > MAX_FILE_BYTES) throw new Error("operational event file exceeds its size limit");
      return parseState(JSON.parse(await readFile(this.statePath, "utf8")) as unknown);
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
        return defaultState();
      }
      throw error;
    }
  }

  private async write(state: EventState): Promise<void> {
    await this.ensureDirectory();
    const body = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(body) > MAX_FILE_BYTES) throw new Error("operational event file exceeds its size limit");
    const temporary = join(this.dataLocation, `.events-${process.pid}-${Date.now()}.tmp`);
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
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("operational event directory is unsafe");
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("operational event directory must not be accessible by group or other users");
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
