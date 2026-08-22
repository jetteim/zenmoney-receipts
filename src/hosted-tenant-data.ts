import { createHash } from "node:crypto";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 1_000;
const STATE_FILES = {
  "receipt-memory/receipt-memory.json": "receiptMemory",
  "operation-journal/operations.json": "recoveryJournal",
  "events/events.json": "operationalEvents"
} as const;

export interface HostedTenantDataSnapshot {
  receiptMemory: boolean;
  recoveryJournal: boolean;
  operationalEvents: boolean;
  fileCount: number;
  digest: string;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

export class HostedTenantDataController {
  readonly dataLocation: string;

  constructor(tenantRoot: string) {
    this.dataLocation = resolve(tenantRoot);
  }

  async snapshot(): Promise<HostedTenantDataSnapshot> {
    const digest = createHash("sha256");
    const presence = {
      receiptMemory: false,
      recoveryJournal: false,
      operationalEvents: false
    };
    try {
      const root = await lstat(this.dataLocation);
      if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("hosted tenant data directory is unsafe");
    } catch (error) {
      if (!isMissing(error)) throw error;
      return { ...presence, fileCount: 0, digest: digest.update("absent").digest("hex") };
    }
    let fileCount = 0;
    let byteCount = 0;
    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const path = join(directory, entry.name);
        const name = relative(this.dataLocation, path).split("\\").join("/");
        const stat = await lstat(path);
        if (stat.isSymbolicLink()) throw new Error("hosted tenant state contains an unsafe symbolic link");
        if (stat.isDirectory()) {
          digest.update(`directory:${name}\0`);
          await walk(path);
          continue;
        }
        if (!stat.isFile()) throw new Error("hosted tenant state contains an unsupported filesystem entry");
        fileCount += 1;
        byteCount += stat.size;
        if (fileCount > MAX_SNAPSHOT_FILES || byteCount > MAX_SNAPSHOT_BYTES) {
          throw new Error("hosted tenant state exceeds its deletion-preview safety limit");
        }
        const known = STATE_FILES[name as keyof typeof STATE_FILES];
        if (known) presence[known] = true;
        digest.update(`file:${name}\0`).update(await readFile(path)).update("\0");
      }
    };
    await walk(this.dataLocation);
    return { ...presence, fileCount, digest: digest.digest("hex") };
  }

  async delete(expectedDigest: string): Promise<{ deleted: boolean; verified: true }> {
    const current = await this.snapshot();
    if (current.digest !== expectedDigest) throw new Error("hosted tenant data changed after preview; create a new preview");
    try {
      const stat = await lstat(this.dataLocation);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("hosted tenant data directory is unsafe");
      await rm(this.dataLocation, { recursive: true, force: false, maxRetries: 2 });
    } catch (error) {
      if (isMissing(error)) return { deleted: false, verified: true };
      throw error;
    }
    try {
      await lstat(this.dataLocation);
      throw new Error("hosted tenant data deletion could not be verified");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return { deleted: true, verified: true };
  }
}
