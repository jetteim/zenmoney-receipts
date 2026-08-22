import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

const ENVELOPE_VERSION = 1;
const MAX_ENVELOPE_BYTES = 64 * 1024;
const MAX_PENDING_STATES = 1_000;
const PENDING_STATE_FILE_TTL_MS = 15 * 60_000;

export interface StoredZenMoneyCredential {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string[];
  updatedAt: string;
}

export interface PendingZenMoneyLink {
  tenantId: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

export interface EncryptedEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface HostedCredentialStore {
  get(tenantId: string): Promise<StoredZenMoneyCredential | null>;
  put(tenantId: string, credential: StoredZenMoneyCredential): Promise<void>;
  delete(tenantId: string): Promise<boolean>;
  putPending(link: PendingZenMoneyLink): Promise<void>;
  consumePending(state: string): Promise<PendingZenMoneyLink | null>;
}

function parseMasterKey(value: string | undefined): Buffer {
  if (!value) throw new Error("hosted credential encryption key is not configured");
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value.replace(/=+$/, "")) {
    throw new Error("hosted credential encryption key must be an unpadded base64url 32-byte value");
  }
  return key;
}

function validTenantId(value: string): boolean {
  return value.length >= 1 && value.length <= 240 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isStoredZenMoneyCredential(value: unknown): value is StoredZenMoneyCredential {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === "string" &&
    record.accessToken.length >= 10 &&
    record.accessToken.length <= 8192 &&
    (record.refreshToken === null ||
      (typeof record.refreshToken === "string" && record.refreshToken.length >= 10 && record.refreshToken.length <= 8192)) &&
    (record.expiresAt === null || (typeof record.expiresAt === "number" && Number.isFinite(record.expiresAt))) &&
    Array.isArray(record.scope) &&
    record.scope.length <= 20 &&
    record.scope.every((scope) => typeof scope === "string" && /^[A-Za-z0-9:._-]{1,100}$/.test(scope)) &&
    typeof record.updatedAt === "string" &&
    Number.isFinite(Date.parse(record.updatedAt))
  );
}

export function isPendingZenMoneyLink(value: unknown): value is PendingZenMoneyLink {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.tenantId === "string" &&
    validTenantId(record.tenantId) &&
    typeof record.state === "string" &&
    /^[A-Za-z0-9_-]{32,128}$/.test(record.state) &&
    typeof record.codeVerifier === "string" &&
    /^[A-Za-z0-9._~-]{43,128}$/.test(record.codeVerifier) &&
    typeof record.redirectUri === "string" &&
    record.redirectUri.length <= 2048 &&
    typeof record.createdAt === "string" &&
    Number.isFinite(Date.parse(record.createdAt))
  );
}

export class EncryptedFileCredentialStore implements HostedCredentialStore {
  readonly dataLocation: string;
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(rootDirectory: string, masterKey?: Buffer) {
    this.dataLocation = resolve(rootDirectory);
    const key = masterKey ? Buffer.from(masterKey) : parseMasterKey(process.env.ZENMONEY_HOSTED_MASTER_KEY);
    if (key.length !== 32) throw new Error("hosted credential encryption key must contain 32 bytes");
    this.encryptionKey = createHmac("sha256", key).update("zenmoney-receipts/encryption/v1").digest();
    this.lookupKey = createHmac("sha256", key).update("zenmoney-receipts/lookup/v1").digest();
  }

  async get(tenantId: string): Promise<StoredZenMoneyCredential | null> {
    this.requireTenant(tenantId);
    const value = await this.readEncrypted(this.tenantPath(tenantId), `tenant:${this.tenantKey(tenantId)}`);
    if (value === null) return null;
    if (!isStoredZenMoneyCredential(value)) throw new Error("hosted credential record is invalid");
    return value;
  }

  async put(tenantId: string, credential: StoredZenMoneyCredential): Promise<void> {
    this.requireTenant(tenantId);
    if (!isStoredZenMoneyCredential(credential)) throw new Error("hosted credential record is invalid");
    await this.writeEncrypted(
      this.tenantPath(tenantId),
      `tenant:${this.tenantKey(tenantId)}`,
      credential
    );
  }

  async delete(tenantId: string): Promise<boolean> {
    this.requireTenant(tenantId);
    await this.ensureDirectory();
    try {
      await unlink(this.tenantPath(tenantId));
      return true;
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async putPending(link: PendingZenMoneyLink): Promise<void> {
    if (!isPendingZenMoneyLink(link)) throw new Error("pending OAuth link is invalid");
    await this.prunePendingStates();
    await this.writeEncrypted(this.statePath(link.state), `state:${this.stateKey(link.state)}`, link);
  }

  async consumePending(state: string): Promise<PendingZenMoneyLink | null> {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
    const path = this.statePath(state);
    const value = await this.readEncrypted(path, `state:${this.stateKey(state)}`);
    if (value === null) return null;
    await unlink(path);
    if (!isPendingZenMoneyLink(value)) throw new Error("pending OAuth link is invalid");
    return value;
  }

  private requireTenant(tenantId: string): void {
    if (!validTenantId(tenantId)) throw new Error("tenant identity is invalid");
  }

  private tenantKey(tenantId: string): string {
    return createHmac("sha256", this.lookupKey).update(`tenant\0${tenantId}`).digest("hex");
  }

  private stateKey(state: string): string {
    return createHmac("sha256", this.lookupKey).update(`state\0${state}`).digest("hex");
  }

  private tenantPath(tenantId: string): string {
    return join(this.dataLocation, `tenant-${this.tenantKey(tenantId)}.enc`);
  }

  private statePath(state: string): string {
    return join(this.dataLocation, `state-${this.stateKey(state)}.enc`);
  }

  private async prunePendingStates(now = Date.now()): Promise<void> {
    await this.ensureDirectory();
    const names = (await readdir(this.dataLocation)).filter((name) => /^state-[a-f0-9]{64}\.enc$/.test(name));
    let active = 0;
    for (const name of names) {
      const path = join(this.dataLocation, name);
      try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.mtimeMs < now - PENDING_STATE_FILE_TTL_MS) {
          await unlink(path);
        } else {
          active += 1;
        }
      } catch (error) {
        if (!(typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT")) {
          throw error;
        }
      }
    }
    if (active >= MAX_PENDING_STATES) throw new Error("pending OAuth state capacity is reached");
  }

  private async readEncrypted(path: string, aad: string): Promise<unknown | null> {
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("hosted credential path is unsafe");
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("hosted credential file permissions are unsafe");
      }
      if (stat.size > MAX_ENVELOPE_BYTES) throw new Error("hosted credential record exceeds its size limit");
      const envelope = JSON.parse(await readFile(path, "utf8")) as EncryptedEnvelope;
      if (
        envelope.version !== ENVELOPE_VERSION ||
        typeof envelope.iv !== "string" ||
        typeof envelope.tag !== "string" ||
        typeof envelope.ciphertext !== "string"
      ) {
        throw new Error("hosted credential envelope is invalid");
      }
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(envelope.iv, "base64url"));
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final()
      ]);
      return JSON.parse(plaintext.toString("utf8")) as unknown;
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
        return null;
      }
      throw new Error("hosted credential record could not be decrypted or validated");
    }
  }

  private async writeEncrypted(path: string, aad: string, value: unknown): Promise<void> {
    await this.ensureDirectory();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      version: ENVELOPE_VERSION,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url")
    };
    const body = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(body) > MAX_ENVELOPE_BYTES) throw new Error("hosted credential record exceeds its size limit");
    const temporary = join(this.dataLocation, `.credential-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    if (process.platform !== "win32") await chmod(path, 0o600);
  }

  private async ensureDirectory(): Promise<void> {
    try {
      const stat = await lstat(this.dataLocation);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("hosted credential directory is unsafe");
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("hosted credential directory permissions are unsafe");
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
