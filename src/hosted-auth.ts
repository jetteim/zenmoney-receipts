import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export interface IntrospectionVerifierConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  resource: string;
  requiredScopes: string[];
}

function httpsUrl(value: string, field: string): URL {
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

function audienceContains(audience: unknown, resource: string): boolean {
  return audience === resource || (Array.isArray(audience) && audience.includes(resource));
}

export class IntrospectionTokenVerifier implements OAuthTokenVerifier {
  private readonly endpoint: URL;
  private readonly issuer: URL;
  private readonly resource: URL;

  constructor(
    private readonly config: IntrospectionVerifierConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {
    this.endpoint = httpsUrl(config.endpoint, "OAuth introspection endpoint");
    this.issuer = httpsUrl(config.issuer, "OAuth issuer");
    this.resource = httpsUrl(config.resource, "MCP resource");
    if (!config.clientId || !config.clientSecret) throw new Error("OAuth introspection client is incomplete");
    if (config.requiredScopes.some((scope) => !/^[A-Za-z0-9:._-]{1,100}$/.test(scope))) {
      throw new Error("required OAuth scope is invalid");
    }
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (token.length < 10 || token.length > 16_384 || /[\u0000-\u0020\u007f]/.test(token)) {
      throw new Error("access credential is invalid");
    }
    const authorization = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`, "utf8").toString("base64");
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({ token, token_type_hint: "access_token" }),
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new Error("OAuth introspection is unavailable");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("OAuth introspection rejected the request");
    }
    const value = (await response.json()) as Record<string, unknown>;
    if (value.active !== true || typeof value.sub !== "string" || value.sub.length < 1 || value.sub.length > 240) {
      throw new Error("access credential is inactive or has no tenant subject");
    }
    if (value.iss !== this.issuer.href.replace(/\/$/, "")) {
      throw new Error("access credential issuer is invalid");
    }
    if (!audienceContains(value.aud, this.resource.href)) {
      throw new Error("access credential audience is invalid");
    }
    const scopes = Array.isArray(value.scope)
      ? value.scope.filter((scope): scope is string => typeof scope === "string")
      : typeof value.scope === "string"
        ? value.scope.split(/\s+/).filter(Boolean)
        : [];
    if (!this.config.requiredScopes.every((scope) => scopes.includes(scope))) {
      throw new Error("access credential scope is insufficient");
    }
    if (typeof value.exp !== "number" || !Number.isFinite(value.exp)) {
      throw new Error("access credential expiration is missing or invalid");
    }
    const expiresAt = value.exp;
    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error("access credential has expired");
    }
    return {
      token,
      clientId: typeof value.client_id === "string" ? value.client_id : "unknown-client",
      scopes,
      expiresAt,
      resource: this.resource,
      extra: { sub: value.sub }
    };
  }
}

export function tenantIdFromAuth(auth: AuthInfo): string {
  const tenantId = auth.extra?.sub;
  if (typeof tenantId !== "string" || tenantId.length < 1 || tenantId.length > 240) {
    throw new Error("authenticated tenant subject is unavailable");
  }
  return tenantId;
}
