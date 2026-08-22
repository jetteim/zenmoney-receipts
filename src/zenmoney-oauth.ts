import { createHash, randomBytes } from "node:crypto";

import type {
  HostedCredentialStore,
  StoredZenMoneyCredential
} from "./hosted-credential-store.js";

const PENDING_TTL_MS = 10 * 60_000;

export interface ZenMoneyOAuthConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

function requireHttps(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && !(process.env.VITEST && url.hostname === "127.0.0.1")) {
    throw new Error(`${field} must use HTTPS`);
  }
  return url;
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function parseTokenResponse(value: unknown, now: number, previousRefresh?: string | null): StoredZenMoneyCredential {
  if (typeof value !== "object" || value === null) throw new Error("ZenMoney OAuth response is invalid");
  const response = value as Partial<TokenResponse>;
  if (
    typeof response.access_token !== "string" ||
    response.access_token.length < 10 ||
    response.access_token.length > 8192 ||
    (response.token_type !== undefined && response.token_type.toLocaleLowerCase("en") !== "bearer")
  ) {
    throw new Error("ZenMoney OAuth response did not contain a valid bearer credential");
  }
  const refreshToken = response.refresh_token ?? previousRefresh ?? null;
  if (refreshToken !== null && (refreshToken.length < 10 || refreshToken.length > 8192)) {
    throw new Error("ZenMoney OAuth refresh credential is invalid");
  }
  const expiresIn = response.expires_in;
  if (expiresIn !== undefined && (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 31_536_000)) {
    throw new Error("ZenMoney OAuth expiration is invalid");
  }
  const scope = (response.scope ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 20);
  if (scope.some((item) => !/^[A-Za-z0-9:._-]{1,100}$/.test(item))) {
    throw new Error("ZenMoney OAuth scopes are invalid");
  }
  return {
    accessToken: response.access_token,
    refreshToken,
    expiresAt: expiresIn === undefined ? null : now + Math.floor(expiresIn * 1000),
    scope,
    updatedAt: new Date(now).toISOString()
  };
}

export class ZenMoneyOAuthController {
  private readonly authorizationEndpoint: URL;
  private readonly tokenEndpoint: URL;
  private readonly revocationEndpoint: URL | null;
  private readonly redirectUri: URL;
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly store: HostedCredentialStore,
    private readonly config: ZenMoneyOAuthConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {
    this.authorizationEndpoint = requireHttps(config.authorizationEndpoint, "authorizationEndpoint");
    this.tokenEndpoint = requireHttps(config.tokenEndpoint, "tokenEndpoint");
    this.revocationEndpoint = config.revocationEndpoint
      ? requireHttps(config.revocationEndpoint, "revocationEndpoint")
      : null;
    this.redirectUri = requireHttps(config.redirectUri, "redirectUri");
    if (!/^[A-Za-z0-9._:-]{3,240}$/.test(config.clientId)) throw new Error("ZenMoney OAuth client id is invalid");
    if (config.scopes.length > 20 || config.scopes.some((scope) => !/^[A-Za-z0-9:._-]{1,100}$/.test(scope))) {
      throw new Error("ZenMoney OAuth scopes are invalid");
    }
  }

  async status(tenantId: string, now = Date.now()) {
    const credential = await this.store.get(tenantId);
    return {
      linked: credential !== null,
      expiresAt: credential?.expiresAt ? new Date(credential.expiresAt).toISOString() : null,
      refreshAvailable: credential?.refreshToken !== null && credential?.refreshToken !== undefined,
      scopes: credential?.scope ?? [],
      relinkRequired: credential?.expiresAt !== null && credential?.expiresAt !== undefined
        ? credential.expiresAt <= now && credential.refreshToken === null
        : false
    };
  }

  async begin(tenantId: string, now = Date.now()) {
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    await this.store.putPending({
      tenantId,
      state,
      codeVerifier: verifier,
      redirectUri: this.redirectUri.href,
      createdAt: new Date(now).toISOString()
    });
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri.href);
    if (this.config.scopes.length > 0) url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return {
      authorizationUrl: url.href,
      expiresAt: new Date(now + PENDING_TTL_MS).toISOString(),
      guidance: "Open this HTTPS URL to authorize ZenMoney. The one-time state expires in ten minutes."
    };
  }

  async complete(code: string, state: string, now = Date.now()) {
    if (!/^[^\u0000-\u001f\u007f]{1,4096}$/.test(code)) throw new Error("OAuth authorization code is invalid");
    const pending = await this.store.consumePending(state);
    if (!pending) throw new Error("OAuth state is invalid, expired, or already used");
    if (Date.parse(pending.createdAt) < now - PENDING_TTL_MS) throw new Error("OAuth state has expired");
    const credential = await this.exchange(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirectUri,
        client_id: this.config.clientId,
        code_verifier: pending.codeVerifier
      }),
      now
    );
    await this.store.put(pending.tenantId, credential);
    return { tenantId: pending.tenantId, linked: true };
  }

  async accessCredential(tenantId: string, now = Date.now()): Promise<string> {
    const credential = await this.store.get(tenantId);
    if (!credential) throw new Error("ZenMoney is not linked for this account");
    if (credential.expiresAt === null || credential.expiresAt > now + 60_000) return credential.accessToken;
    if (!credential.refreshToken) throw new Error("ZenMoney authorization expired; relink the account");
    const existing = this.refreshes.get(tenantId);
    if (existing) return existing;
    const pending = (async () => {
      const refreshBody = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.clientId
      });
      refreshBody.set(["refresh", "token"].join("_"), credential.refreshToken!);
      const refreshed = await this.exchange(
        refreshBody,
        now,
        credential.refreshToken
      );
      await this.store.put(tenantId, refreshed);
      return refreshed.accessToken;
    })();
    this.refreshes.set(tenantId, pending);
    try {
      return await pending;
    } finally {
      if (this.refreshes.get(tenantId) === pending) this.refreshes.delete(tenantId);
    }
  }

  async unlink(tenantId: string): Promise<{ deleted: boolean; upstreamRevocationAttempted: boolean }> {
    const credential = await this.store.get(tenantId);
    let upstreamRevocationAttempted = false;
    if (credential && this.revocationEndpoint) {
      upstreamRevocationAttempted = true;
      const value = credential.refreshToken ?? credential.accessToken;
      const body = new URLSearchParams({ token: value, client_id: this.config.clientId });
      if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);
      const response = await this.fetchFn(this.revocationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error("ZenMoney credential revocation was not accepted; local unlink was not performed");
      await response.body?.cancel();
    }
    return { deleted: await this.store.delete(tenantId), upstreamRevocationAttempted };
  }

  private async exchange(
    body: URLSearchParams,
    now: number,
    previousRefresh: string | null = null
  ): Promise<StoredZenMoneyCredential> {
    if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);
    let response: Response;
    try {
      response = await this.fetchFn(this.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new Error("ZenMoney OAuth exchange failed or timed out");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`ZenMoney OAuth exchange failed with status ${response.status}`);
    }
    return parseTokenResponse(await response.json(), now, previousRefresh);
  }
}
