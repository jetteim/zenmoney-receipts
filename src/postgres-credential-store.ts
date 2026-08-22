import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import type { Pool, QueryResult } from "pg";

import {
  isPendingZenMoneyLink,
  isStoredZenMoneyCredential,
  type EncryptedEnvelope,
  type HostedCredentialStore,
  type PendingZenMoneyLink,
  type StoredZenMoneyCredential
} from "./hosted-credential-store.js";

interface Queryable {
  query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>>;
}

function storageKey(masterKey: Buffer, kind: "tenant" | "state", value: string): string {
  const lookupKey = createHmac("sha256", masterKey).update("zenmoney-receipts/lookup/v1").digest();
  return createHmac("sha256", lookupKey).update(`${kind}\0${value}`).digest("hex");
}

function encryptionKey(masterKey: Buffer): Buffer {
  return createHmac("sha256", masterKey).update("zenmoney-receipts/encryption/v1").digest();
}

function encrypt(masterKey: Buffer, aad: string, value: unknown): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(masterKey), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decrypt(masterKey: Buffer, aad: string, raw: unknown): unknown {
  const envelope = typeof raw === "string" ? JSON.parse(raw) as EncryptedEnvelope : raw as EncryptedEnvelope;
  if (
    envelope?.version !== 1 ||
    typeof envelope.iv !== "string" ||
    typeof envelope.tag !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("hosted credential envelope is invalid");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(masterKey), Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final()
      ]).toString("utf8")
    ) as unknown;
  } catch {
    throw new Error("hosted credential record could not be decrypted or validated");
  }
}

export class PostgresCredentialStore implements HostedCredentialStore {
  private readonly initialized: Promise<void>;

  constructor(private readonly database: Queryable | Pool, private readonly masterKey: Buffer) {
    if (masterKey.length !== 32) throw new Error("hosted credential encryption key must contain 32 bytes");
    this.initialized = this.initialize();
  }

  async get(tenantId: string): Promise<StoredZenMoneyCredential | null> {
    await this.initialized;
    const key = storageKey(this.masterKey, "tenant", tenantId);
    const result = await this.database.query(
      "SELECT envelope FROM zenmoney_tenant_credentials WHERE storage_key = $1",
      [key]
    );
    if (result.rowCount === 0) return null;
    const value = decrypt(this.masterKey, `tenant:${key}`, result.rows[0]?.envelope);
    if (!isStoredZenMoneyCredential(value)) throw new Error("hosted credential record is invalid");
    return value;
  }

  async put(tenantId: string, credential: StoredZenMoneyCredential): Promise<void> {
    if (!isStoredZenMoneyCredential(credential)) throw new Error("hosted credential record is invalid");
    await this.initialized;
    const key = storageKey(this.masterKey, "tenant", tenantId);
    const envelope = encrypt(this.masterKey, `tenant:${key}`, credential);
    await this.database.query(
      "INSERT INTO zenmoney_tenant_credentials (storage_key, envelope, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (storage_key) DO UPDATE SET envelope = EXCLUDED.envelope, updated_at = NOW()",
      [key, JSON.stringify(envelope)]
    );
  }

  async delete(tenantId: string): Promise<boolean> {
    await this.initialized;
    const result = await this.database.query(
      "DELETE FROM zenmoney_tenant_credentials WHERE storage_key = $1",
      [storageKey(this.masterKey, "tenant", tenantId)]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async putPending(link: PendingZenMoneyLink): Promise<void> {
    if (!isPendingZenMoneyLink(link)) throw new Error("pending OAuth link is invalid");
    await this.initialized;
    await this.database.query("DELETE FROM zenmoney_oauth_states WHERE expires_at <= NOW()");
    const key = storageKey(this.masterKey, "state", link.state);
    const envelope = encrypt(this.masterKey, `state:${key}`, link);
    await this.database.query(
      "INSERT INTO zenmoney_oauth_states (storage_key, envelope, expires_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (storage_key) DO UPDATE SET envelope = EXCLUDED.envelope, expires_at = EXCLUDED.expires_at",
      [key, JSON.stringify(envelope), new Date(Date.parse(link.createdAt) + 10 * 60_000)]
    );
  }

  async consumePending(state: string): Promise<PendingZenMoneyLink | null> {
    await this.initialized;
    const key = storageKey(this.masterKey, "state", state);
    const result = await this.database.query(
      "DELETE FROM zenmoney_oauth_states WHERE storage_key = $1 AND expires_at > NOW() RETURNING envelope",
      [key]
    );
    if (result.rowCount === 0) return null;
    const value = decrypt(this.masterKey, `state:${key}`, result.rows[0]?.envelope);
    if (!isPendingZenMoneyLink(value)) throw new Error("pending OAuth link is invalid");
    return value;
  }

  private async initialize(): Promise<void> {
    await this.database.query(
      "CREATE TABLE IF NOT EXISTS zenmoney_tenant_credentials (storage_key CHAR(64) PRIMARY KEY, envelope JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await this.database.query(
      "CREATE TABLE IF NOT EXISTS zenmoney_oauth_states (storage_key CHAR(64) PRIMARY KEY, envelope JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL)"
    );
    await this.database.query(
      "CREATE INDEX IF NOT EXISTS zenmoney_oauth_states_expires_idx ON zenmoney_oauth_states (expires_at)"
    );
    await this.database.query("DELETE FROM zenmoney_oauth_states WHERE expires_at <= NOW()");
  }
}
