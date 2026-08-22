import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { describe, expect, it } from "vitest";

import { EncryptedFileCredentialStore } from "../src/hosted-credential-store.js";
import { createHostedHttpServer, type HostedServerConfig } from "../src/hosted-server.js";
import { ZenMoneyReceiptService } from "../src/service.js";
import type { Backend } from "../src/types.js";
import { ZenMoneyOAuthController } from "../src/zenmoney-oauth.js";

const run = process.env.ZENMONEY_HOSTED_HTTP_TEST === "1";

describe("hosted HTTP integration", () => {
  it.skipIf(!run)("serves MCP initialization and rejects cross-tenant session reuse", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zenmoney-hosted-http-"));
    const config: HostedServerConfig = {
      listenHost: "127.0.0.1",
      port: 0,
      publicOrigin: "http://127.0.0.1:9999",
      authorizationServerIssuer: "http://127.0.0.1:9998",
      requiredScopes: ["mcp:tools"],
      dataDirectory: directory,
      masterKey: Buffer.alloc(32, 3),
      introspection: { endpoint: "http://127.0.0.1:9998/introspect", clientId: "id", clientSecret: "secret" },
      zenMoneyOAuth: {
        authorizationEndpoint: "http://127.0.0.1:9997/authorize",
        tokenEndpoint: "http://127.0.0.1:9997/token",
        clientId: "zen-client",
        redirectUri: "http://127.0.0.1:9999/oauth/zenmoney/callback",
        scopes: []
      }
    };
    const unused: Backend = {
      async call() { throw new Error("discovery must not call ZenMoney"); },
      async close() {}
    };
    const verifier = {
      async verifyAccessToken(token: string): Promise<AuthInfo> {
        return {
          token,
          clientId: "test-client",
          scopes: ["mcp:tools"],
          resource: new URL("http://127.0.0.1:9999/mcp"),
          extra: { sub: token.endsWith("alpha") ? "tenant-alpha" : "tenant-beta" }
        };
      }
    };
    const oauth = new ZenMoneyOAuthController(
      new EncryptedFileCredentialStore(join(directory, "oauth"), config.masterKey),
      config.zenMoneyOAuth,
      async () => Response.json({ access_token: ["unused", "access", "private"].join("-"), token_type: "Bearer" })
    );
    const hosted = createHostedHttpServer(config, {
      verifier,
      oauthController: oauth,
      serviceFactory: () => new ZenMoneyReceiptService(unused)
    });
    try {
      await new Promise<void>((resolveListen, reject) => {
        hosted.server.once("error", reject);
        hosted.server.listen(0, "127.0.0.1", resolveListen);
      });
      const address = hosted.server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      const base = `http://127.0.0.1:${address.port}`;
      const hostileOrigin = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: { Origin: "https://hostile.example", "Content-Type": "application/json" },
        body: "{}"
      });
      expect(hostileOrigin.status).toBe(403);

      const initialize = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer access-alpha",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "hosted-integration", version: "1" }
          }
        })
      });
      expect(initialize.status).toBe(200);
      const sessionId = initialize.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      const crossed = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer access-beta",
          "Mcp-Session-Id": sessionId!,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream"
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
      });
      expect(crossed.status).toBe(403);
    } finally {
      if (hosted.server.listening) await hosted.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
