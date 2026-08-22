import type { QueryResult } from "pg";
import { describe, expect, it } from "vitest";

import { PostgresCredentialStore } from "../src/postgres-credential-store.js";

function result(rows: Array<Record<string, unknown>> = [], rowCount = rows.length): QueryResult<Record<string, unknown>> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class FakeDatabase {
  credentials = new Map<string, unknown>();
  states = new Map<string, unknown>();
  parameters: unknown[][] = [];

  async query(text: string, values: unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
    this.parameters.push(values);
    if (text.startsWith("CREATE") || text.startsWith("DELETE FROM zenmoney_oauth_states WHERE expires_at")) {
      return result([], 0);
    }
    const key = String(values[0]);
    if (text.startsWith("SELECT envelope FROM zenmoney_tenant_credentials")) {
      return this.credentials.has(key) ? result([{ envelope: this.credentials.get(key) }]) : result();
    }
    if (text.startsWith("INSERT INTO zenmoney_tenant_credentials")) {
      this.credentials.set(key, JSON.parse(String(values[1])));
      return result([], 1);
    }
    if (text.startsWith("DELETE FROM zenmoney_tenant_credentials")) {
      return result([], this.credentials.delete(key) ? 1 : 0);
    }
    if (text.startsWith("INSERT INTO zenmoney_oauth_states")) {
      this.states.set(key, JSON.parse(String(values[1])));
      return result([], 1);
    }
    if (text.startsWith("DELETE FROM zenmoney_oauth_states WHERE storage_key")) {
      const envelope = this.states.get(key);
      this.states.delete(key);
      return envelope ? result([{ envelope }]) : result();
    }
    throw new Error(`unexpected SQL in fixture: ${text.slice(0, 30)}`);
  }
}

describe("PostgresCredentialStore", () => {
  it("uses HMAC tenant keys, encrypted envelopes, and one-time OAuth states", async () => {
    const database = new FakeDatabase();
    const store = new PostgresCredentialStore(database, Buffer.alloc(32, 6));
    const stored = {
      accessToken: "access-private-value",
      refreshToken: "refresh-private-value",
      expiresAt: Date.UTC(2026, 8, 1),
      scope: ["read"],
      updatedAt: "2026-08-22T00:00:00.000Z"
    };
    await store.put("tenant-private-id", stored);
    expect(await store.get("tenant-private-id")).toEqual(stored);
    expect([...database.credentials.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
    const serializedParameters = JSON.stringify(database.parameters);
    expect(serializedParameters).not.toContain("tenant-private-id");
    expect(serializedParameters).not.toContain("access-private-value");
    expect(serializedParameters).not.toContain("refresh-private-value");

    const pending = {
      tenantId: "tenant-private-id",
      state: "s".repeat(43),
      codeVerifier: "v".repeat(64),
      redirectUri: "https://connector.example/oauth/zenmoney/callback",
      createdAt: "2026-08-22T00:00:00.000Z"
    };
    await store.putPending(pending);
    expect(await store.consumePending(pending.state)).toEqual(pending);
    expect(await store.consumePending(pending.state)).toBeNull();
    expect(await store.delete("tenant-private-id")).toBe(true);
    expect(await store.get("tenant-private-id")).toBeNull();
  });
});
