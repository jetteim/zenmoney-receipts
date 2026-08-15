import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface PreviewPayload {
  version: 1;
  transactionId: string;
  expectedChanged: number;
  tagIds: string[];
  expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export class PreviewTokenManager {
  private readonly signingKey: Buffer;

  constructor(signingKey = randomBytes(32)) {
    this.signingKey = signingKey;
  }

  create(
    input: Omit<PreviewPayload, "version" | "expiresAt">,
    options: { now?: number; ttlMs?: number } = {}
  ): { token: string; expiresAt: string } {
    const now = options.now ?? Date.now();
    const payload: PreviewPayload = {
      version: 1,
      transactionId: input.transactionId,
      expectedChanged: input.expectedChanged,
      tagIds: [...input.tagIds],
      expiresAt: now + (options.ttlMs ?? 10 * 60_000)
    };
    const body = encode(JSON.stringify(payload));
    const signature = createHmac("sha256", this.signingKey).update(body).digest("base64url");
    return { token: `${body}.${signature}`, expiresAt: new Date(payload.expiresAt).toISOString() };
  }

  verify(token: string, now = Date.now()): PreviewPayload {
    if (token.length > 4096) throw new Error("preview token is invalid");
    const [body, receivedSignature, extra] = token.split(".");
    if (!body || !receivedSignature || extra !== undefined) {
      throw new Error("preview token is invalid");
    }

    const expectedSignature = createHmac("sha256", this.signingKey).update(body).digest();
    let suppliedSignature: Buffer;
    try {
      suppliedSignature = Buffer.from(receivedSignature, "base64url");
    } catch {
      throw new Error("preview token is invalid");
    }
    if (
      expectedSignature.length !== suppliedSignature.length ||
      !timingSafeEqual(expectedSignature, suppliedSignature)
    ) {
      throw new Error("preview token is invalid");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(decode(body)) as unknown;
    } catch {
      throw new Error("preview token is invalid");
    }
    if (!isPreviewPayload(payload)) {
      throw new Error("preview token is invalid");
    }
    if (payload.expiresAt <= now) {
      throw new Error("preview token has expired; create a new preview");
    }
    return payload;
  }
}

function isPreviewPayload(value: unknown): value is PreviewPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.transactionId === "string" &&
    record.transactionId.length > 0 &&
    typeof record.expectedChanged === "number" &&
    Number.isFinite(record.expectedChanged) &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt) &&
    Array.isArray(record.tagIds) &&
    record.tagIds.length >= 1 &&
    record.tagIds.length <= 5 &&
    record.tagIds.every((item) => typeof item === "string" && item.length > 0)
  );
}
