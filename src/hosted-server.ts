import { createHmac, randomUUID } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve, join } from "node:path";

import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Pool } from "pg";

import { LazyBackend } from "./backend.js";
import { EncryptedFileCredentialStore } from "./hosted-credential-store.js";
import type { HostedCredentialStore } from "./hosted-credential-store.js";
import { HostedOAuthTools } from "./hosted-oauth-tools.js";
import { HostedTenantDataController } from "./hosted-tenant-data.js";
import { IntrospectionTokenVerifier, tenantIdFromAuth } from "./hosted-auth.js";
import { OperationJournal } from "./operation-journal.js";
import { PrivacySafeEventStore } from "./observability.js";
import { PostgresCredentialStore } from "./postgres-credential-store.js";
import { ReceiptMemoryController } from "./receipt-memory.js";
import { ReceiptMemoryStore } from "./receipt-memory-store.js";
import { createServer } from "./server.js";
import { ZenMoneyReceiptService } from "./service.js";
import { ZenMoneyOAuthController, type ZenMoneyOAuthConfig } from "./zenmoney-oauth.js";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_SESSIONS = 100;
const SESSION_IDLE_MS = 30 * 60_000;

export interface HostedServerConfig {
  listenHost: string;
  port: number;
  publicOrigin: string;
  allowedOrigins?: string[];
  authorizationServerIssuer: string;
  requiredScopes: string[];
  dataDirectory: string;
  databaseUrl?: string;
  masterKey: Buffer;
  introspection: {
    endpoint: string;
    clientId: string;
    clientSecret: string;
  };
  zenMoneyOAuth: ZenMoneyOAuthConfig;
}

interface HostedSession {
  tenantId: string;
  lastSeen: number;
  transport: StreamableHTTPServerTransport;
  service: ZenMoneyReceiptService;
  server: ReturnType<typeof createServer>;
}

export function sessionBelongsToTenant(
  session: Pick<HostedSession, "tenantId">,
  tenantId: string
): boolean {
  return session.tenantId === tenantId;
}

export function protectedResourceMetadata(input: {
  resource: string;
  authorizationServerIssuer: string;
  scopes: string[];
}) {
  return {
    resource: input.resource,
    authorization_servers: [input.authorizationServerIssuer.replace(/\/$/, "")],
    scopes_supported: [...input.scopes],
    resource_name: "ZenMoney Receipts"
  };
}

export interface HostedServerDependencies {
  verifier?: OAuthTokenVerifier;
  oauthController?: ZenMoneyOAuthController;
  credentialStore?: HostedCredentialStore;
  serviceFactory?: (tenantId: string) => ZenMoneyReceiptService;
}

function requireHttpsOrigin(value: string): URL {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("hosted public origin must not include a path, query, or fragment");
  if (url.protocol !== "https:" && !(process.env.VITEST && url.hostname === "127.0.0.1")) {
    throw new Error("hosted public origin must use HTTPS");
  }
  return url;
}

function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = `${JSON.stringify(value)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(body);
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body exceeds 1 MiB");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("request body is not valid JSON");
  }
}

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? /^Bearer ([^\s]+)$/.exec(header) : null;
  if (!match) throw new Error("missing bearer credential");
  return match[1]!;
}

function tenantNamespace(masterKey: Buffer, tenantId: string): string {
  return createHmac("sha256", masterKey).update(`runtime\0${tenantId}`).digest("hex");
}

export function createHostedHttpServer(config: HostedServerConfig, dependencies: HostedServerDependencies = {}) {
  const origin = requireHttpsOrigin(config.publicOrigin);
  const resource = new URL("/mcp", origin);
  const allowedBrowserOrigins = new Set([
    origin.origin,
    ...(config.allowedOrigins ?? []).map((value) => requireHttpsOrigin(value).origin)
  ]);
  const issuer = new URL(config.authorizationServerIssuer);
  if (issuer.protocol !== "https:" && !(process.env.VITEST && issuer.hostname === "127.0.0.1")) {
    throw new Error("authorization server issuer must use HTTPS");
  }
  const pool = !dependencies.credentialStore && config.databaseUrl
    ? new Pool({ connectionString: config.databaseUrl, max: 10 })
    : null;
  const store =
    dependencies.credentialStore ??
    (pool
      ? new PostgresCredentialStore(pool, config.masterKey)
      : new EncryptedFileCredentialStore(join(resolve(config.dataDirectory), "credentials"), config.masterKey));
  const oauth = dependencies.oauthController ?? new ZenMoneyOAuthController(store, config.zenMoneyOAuth);
  const verifier =
    dependencies.verifier ??
    new IntrospectionTokenVerifier({
      ...config.introspection,
      issuer: issuer.href.replace(/\/$/, ""),
      resource: resource.href,
      requiredScopes: config.requiredScopes
    });
  const sessions = new Map<string, HostedSession>();

  const serviceFactory = dependencies.serviceFactory ?? ((tenantId: string) => {
    const namespace = tenantNamespace(config.masterKey, tenantId);
    const tenantRoot = join(resolve(config.dataDirectory), "tenant-state", namespace);
    const events = new PrivacySafeEventStore(join(tenantRoot, "events"));
    const backend = new LazyBackend({
      events,
      credentialResolver: async () => ({
        token: await oauth.accessCredential(tenantId),
        source: "hosted-encrypted"
      })
    });
    return new ZenMoneyReceiptService(
      backend,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new ReceiptMemoryController(new ReceiptMemoryStore(join(tenantRoot, "receipt-memory"))),
      new OperationJournal(join(tenantRoot, "operation-journal")),
      events
    );
  });

  async function pruneSessions(now: number): Promise<void> {
    for (const [sessionId, session] of sessions) {
      if (session.lastSeen < now - SESSION_IDLE_MS) {
        sessions.delete(sessionId);
        await session.transport.close().catch(() => undefined);
        await session.server.close().catch(() => undefined);
        await session.service.close().catch(() => undefined);
      }
    }
  }

  const httpServer = createHttpServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", origin);
    if (req.method === "GET" && requestUrl.pathname === "/healthz") {
      json(res, 200, { ok: true, service: "zenmoney-receipts", transport: "streamable-http" });
      return;
    }
    if (
      req.method === "GET" &&
      ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"].includes(
        requestUrl.pathname
      )
    ) {
      json(
        res,
        200,
        protectedResourceMetadata({
          resource: resource.href,
          authorizationServerIssuer: issuer.href,
          scopes: config.requiredScopes
        })
      );
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/oauth/zenmoney/callback") {
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      if (!code || !state) {
        json(res, 400, { ok: false, error: "missing OAuth callback parameters" });
        return;
      }
      try {
        await oauth.complete(code, state);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY"
        });
        res.end("<!doctype html><meta charset=utf-8><title>ZenMoney linked</title><p>ZenMoney is linked. You may close this window.</p>");
      } catch {
        json(res, 400, { ok: false, error: "ZenMoney authorization could not be completed; start a new link" });
      }
      return;
    }
    if (requestUrl.pathname !== "/mcp") {
      json(res, 404, { ok: false, error: "not found" });
      return;
    }
    const browserOrigin = req.headers.origin;
    if (typeof browserOrigin === "string" && !allowedBrowserOrigins.has(browserOrigin)) {
      json(res, 403, { error: "origin is not allowed" });
      return;
    }

    let auth: AuthInfo;
    try {
      auth = await verifier.verifyAccessToken(bearer(req));
    } catch {
      json(res, 401, { error: "unauthorized" }, {
        "WWW-Authenticate": `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/mcp", origin).href}", scope="${config.requiredScopes.join(" ")}"`
      });
      return;
    }
    const tenantId = tenantIdFromAuth(auth);
    (req as IncomingMessage & { auth?: AuthInfo }).auth = auth;
    await pruneSessions(Date.now());

    try {
      const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;
      let body: unknown = undefined;
      if (req.method === "POST") body = await parseJsonBody(req);
      let session = sessionId ? sessions.get(sessionId) : undefined;
      if (session && !sessionBelongsToTenant(session, tenantId)) {
        json(res, 403, { error: "session tenant mismatch" });
        return;
      }
      if (!session && req.method === "POST" && isInitializeRequest(body)) {
        if (sessions.size >= MAX_SESSIONS) {
          json(res, 503, { error: "session capacity reached" });
          return;
        }
        const service = serviceFactory(tenantId);
        const hostedTools = new HostedOAuthTools(
          tenantId,
          oauth,
          Boolean(config.zenMoneyOAuth.revocationEndpoint),
          new HostedTenantDataController(join(resolve(config.dataDirectory), "tenant-state", tenantNamespace(config.masterKey, tenantId)))
        );
        const mcpServer = createServer(service, hostedTools);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (createdSessionId) => {
            sessions.set(createdSessionId, {
              tenantId,
              lastSeen: Date.now(),
              transport,
              service,
              server: mcpServer
            });
          }
        });
        transport.onclose = () => {
          const closedId = transport.sessionId;
          if (closedId) sessions.delete(closedId);
          void service.close();
        };
        await mcpServer.connect(transport as unknown as Transport);
        await transport.handleRequest(req as IncomingMessage & { auth?: AuthInfo }, res, body);
        return;
      }
      if (!session) {
        json(res, 400, { error: "missing or invalid MCP session" });
        return;
      }
      session.lastSeen = Date.now();
      await session.transport.handleRequest(req as IncomingMessage & { auth?: AuthInfo }, res, body);
    } catch {
      if (!res.headersSent) json(res, 500, { error: "internal server error" });
      else res.end();
    }
  });

  return {
    server: httpServer,
    resourceUrl: resource.href,
    sessionCount: () => sessions.size,
    async close(): Promise<void> {
      for (const session of sessions.values()) {
        await session.transport.close().catch(() => undefined);
        await session.server.close().catch(() => undefined);
        await session.service.close().catch(() => undefined);
      }
      sessions.clear();
      await pool?.end();
      await new Promise<void>((resolveClose, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolveClose()));
      });
    }
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function hostedPort(): number {
  const raw = process.env.PORT?.trim() || "8080";
  if (!/^\d{1,5}$/.test(raw)) throw new Error("PORT must be an integer from 1 to 65535");
  const value = Number(raw);
  if (value < 1 || value > 65_535) throw new Error("PORT must be an integer from 1 to 65535");
  return value;
}

function requiredScopes(): string[] {
  const scopes = [...new Set((process.env.ZENMONEY_HOSTED_OAUTH_SCOPES ?? "mcp:tools").split(/\s+/).filter(Boolean))];
  if (scopes.length < 1 || scopes.length > 20) throw new Error("hosted OAuth scopes must contain 1 to 20 entries");
  return scopes;
}

export function hostedConfigFromEnvironment(): HostedServerConfig {
  const publicOrigin = requiredEnvironment("ZENMONEY_HOSTED_PUBLIC_ORIGIN");
  return {
    listenHost: process.env.HOST?.trim() || "127.0.0.1",
    port: hostedPort(),
    publicOrigin,
    allowedOrigins: (process.env.ZENMONEY_HOSTED_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    authorizationServerIssuer: requiredEnvironment("ZENMONEY_HOSTED_OAUTH_ISSUER"),
    requiredScopes: requiredScopes(),
    dataDirectory: requiredEnvironment("ZENMONEY_HOSTED_DATA_DIR"),
    ...(process.env.DATABASE_URL?.trim() ? { databaseUrl: process.env.DATABASE_URL.trim() } : {}),
    masterKey: Buffer.from(requiredEnvironment("ZENMONEY_HOSTED_MASTER_KEY"), "base64url"),
    introspection: {
      endpoint: requiredEnvironment("ZENMONEY_HOSTED_OAUTH_INTROSPECTION_URL"),
      clientId: requiredEnvironment("ZENMONEY_HOSTED_OAUTH_INTROSPECTION_CLIENT_ID"),
      clientSecret: requiredEnvironment("ZENMONEY_HOSTED_OAUTH_INTROSPECTION_CLIENT_SECRET")
    },
    zenMoneyOAuth: {
      authorizationEndpoint: requiredEnvironment("ZENMONEY_OAUTH_AUTHORIZATION_URL"),
      tokenEndpoint: requiredEnvironment("ZENMONEY_OAUTH_TOKEN_URL"),
      ...(process.env.ZENMONEY_OAUTH_REVOCATION_URL?.trim()
        ? { revocationEndpoint: process.env.ZENMONEY_OAUTH_REVOCATION_URL.trim() }
        : {}),
      clientId: requiredEnvironment("ZENMONEY_OAUTH_CLIENT_ID"),
      ...(process.env.ZENMONEY_OAUTH_CLIENT_SECRET?.trim()
        ? { clientSecret: process.env.ZENMONEY_OAUTH_CLIENT_SECRET.trim() }
        : {}),
      redirectUri: new URL("/oauth/zenmoney/callback", publicOrigin).href,
      scopes: (process.env.ZENMONEY_OAUTH_SCOPES ?? "").split(/\s+/).filter(Boolean)
    }
  };
}
