import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { IntrospectionTokenVerifier, tenantIdFromAuth } from "../src/hosted-auth.js";
import { EncryptedFileCredentialStore } from "../src/hosted-credential-store.js";
import { ZenMoneyOAuthController } from "../src/zenmoney-oauth.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zenmoney-hosted-auth-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function credential(value: string) {
  return {
    accessToken: `access-${value}-private`,
    refreshToken: `refresh-${value}-private`,
    expiresAt: Date.UTC(2026, 8, 1),
    scope: ["read", "write"],
    updatedAt: "2026-08-22T00:00:00.000Z"
  };
}

describe("hosted credential isolation", () => {
  it("encrypts separate tenant records and deletes only the selected tenant", async () => {
    const directory = await root();
    const store = new EncryptedFileCredentialStore(directory, Buffer.alloc(32, 7));
    await store.put("tenant-alpha", credential("alpha"));
    await store.put("tenant-beta", credential("beta"));

    expect(await store.get("tenant-alpha")).toMatchObject({ accessToken: "access-alpha-private" });
    expect(await store.get("tenant-beta")).toMatchObject({ accessToken: "access-beta-private" });
    const files = await readdir(directory);
    expect(files).toHaveLength(2);
    expect(files.join(" ")).not.toContain("tenant-alpha");
    const bodies = await Promise.all(files.map((file) => readFile(join(directory, file), "utf8")));
    expect(bodies.join(" ")).not.toContain("access-alpha-private");
    expect(bodies.join(" ")).not.toContain("refresh-beta-private");

    expect(await store.delete("tenant-alpha")).toBe(true);
    expect(await store.get("tenant-alpha")).toBeNull();
    expect(await store.get("tenant-beta")).toMatchObject({ accessToken: "access-beta-private" });
    expect(await new EncryptedFileCredentialStore(directory, Buffer.alloc(32, 8)).get("tenant-beta")).toBeNull();
  });
});

describe("ZenMoney OAuth lifecycle", () => {
  it("uses state and S256 PKCE, stores tokens encrypted, refreshes, and revokes before unlink", async () => {
    const store = new EncryptedFileCredentialStore(await root(), Buffer.alloc(32, 4));
    const calls: Array<{ url: string; body: string }> = [];
    let exchange = 0;
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") });
      if (String(input).endsWith("/revoke")) return new Response(null, { status: 200 });
      exchange += 1;
      return Response.json(
        exchange === 1
          ? { access_token: ["access", "first", "private"].join("-"), refresh_token: ["refresh", "first", "private"].join("-"), expires_in: 60, token_type: "Bearer", scope: "read write" }
          : { access_token: ["access", "second", "private"].join("-"), expires_in: 3600, token_type: "Bearer", scope: "read write" }
      );
    };
    const oauth = new ZenMoneyOAuthController(
      store,
      {
        authorizationEndpoint: "https://auth.example/authorize",
        tokenEndpoint: "https://auth.example/token",
        revocationEndpoint: "https://auth.example/revoke",
        clientId: "client-1",
        clientSecret: "client-private",
        redirectUri: "https://connector.example/oauth/zenmoney/callback",
        scopes: ["read", "write"]
      },
      fetchFn
    );

    const begun = await oauth.begin("tenant-1", Date.UTC(2026, 7, 22));
    const url = new URL(begun.authorizationUrl);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const state = url.searchParams.get("state")!;
    await oauth.complete("authorization-code", state, Date.UTC(2026, 7, 22));
    await expect(oauth.complete("authorization-code", state, Date.UTC(2026, 7, 22))).rejects.toThrow("already used");
    expect(await oauth.status("tenant-1")).toMatchObject({ linked: true, refreshAvailable: true });
    expect(
      await Promise.all([
        oauth.accessCredential("tenant-1", Date.UTC(2026, 7, 22) + 61_000),
        oauth.accessCredential("tenant-1", Date.UTC(2026, 7, 22) + 61_000)
      ])
    ).toEqual(["access-second-private", "access-second-private"]);
    expect(calls[0]?.body).toContain("code_verifier=");
    expect(calls[1]?.body).toContain("grant_type=refresh_token");
    expect(calls.filter((call) => call.body.includes("grant_type=refresh_token"))).toHaveLength(1);

    expect(await oauth.unlink("tenant-1")).toEqual({ deleted: true, upstreamRevocationAttempted: true });
    expect(await oauth.status("tenant-1")).toMatchObject({ linked: false });
  });
});

describe("MCP access-token validation", () => {
  it("requires active subject, audience, expiry, and scopes", async () => {
    const fetchFn: typeof fetch = async () =>
      Response.json({
        active: true,
        sub: "tenant-7",
        client_id: "chatgpt-client",
        iss: "https://identity.example",
        aud: ["https://connector.example/mcp"],
        scope: "mcp:tools",
        exp: Math.floor(Date.now() / 1000) + 300
      });
    const verifier = new IntrospectionTokenVerifier(
      {
        endpoint: "https://identity.example/introspect",
        clientId: "resource-server",
        clientSecret: "resource-private",
        issuer: "https://identity.example",
        resource: "https://connector.example/mcp",
        requiredScopes: ["mcp:tools"]
      },
      fetchFn
    );
    const auth = await verifier.verifyAccessToken("opaque-access-private");
    expect(tenantIdFromAuth(auth)).toBe("tenant-7");

    const wrongAudience = new IntrospectionTokenVerifier(
      {
        endpoint: "https://identity.example/introspect",
        clientId: "resource-server",
        clientSecret: "resource-private",
        issuer: "https://identity.example",
        resource: "https://other.example/mcp",
        requiredScopes: ["mcp:tools"]
      },
      fetchFn
    );
    await expect(wrongAudience.verifyAccessToken("opaque-access-private")).rejects.toThrow("audience");

    const missingIssuer = new IntrospectionTokenVerifier(
      {
        endpoint: "https://identity.example/introspect",
        clientId: "connector-client",
        clientSecret: "introspection-private",
        issuer: "https://identity.example",
        resource: "https://connector.example/mcp",
        requiredScopes: ["mcp:tools"]
      },
      async () => Response.json({
        active: true,
        sub: "tenant-7",
        aud: "https://connector.example/mcp",
        scope: "mcp:tools",
        exp: Math.floor(Date.now() / 1000) + 300
      })
    );
    await expect(missingIssuer.verifyAccessToken("opaque-access-private")).rejects.toThrow("issuer");
  });
});
