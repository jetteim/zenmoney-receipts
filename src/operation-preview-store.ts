import { randomBytes } from "node:crypto";

type PendingRecord<TPlan, TResult> = {
  state: "pending" | "applying";
  expiresAt: number;
  plan: TPlan;
  result?: never;
  failure?: never;
};

type AppliedRecord<TPlan, TResult> = {
  state: "applied";
  expiresAt: number;
  plan: TPlan;
  result: TResult;
  failure?: never;
};

type FailedRecord<TPlan, TResult> = {
  state: "failed";
  expiresAt: number;
  plan: TPlan;
  result?: never;
  failure: string;
};

type PreviewRecord<TPlan, TResult> =
  | PendingRecord<TPlan, TResult>
  | AppliedRecord<TPlan, TResult>
  | FailedRecord<TPlan, TResult>;

export class OperationPreviewStore<TPlan, TResult> {
  private readonly records = new Map<string, PreviewRecord<TPlan, TResult>>();

  create(
    plan: TPlan,
    options: { now?: number; ttlMs?: number } = {}
  ): { previewToken: string; expiresAt: string } {
    const now = options.now ?? Date.now();
    this.prune(now);
    while (this.records.size >= 100) {
      const oldest = this.records.keys().next().value as string | undefined;
      if (!oldest) break;
      this.records.delete(oldest);
    }

    const previewToken = randomBytes(32).toString("base64url");
    const expiresAt = now + (options.ttlMs ?? 10 * 60_000);
    this.records.set(previewToken, { state: "pending", expiresAt, plan });
    return { previewToken, expiresAt: new Date(expiresAt).toISOString() };
  }

  begin(
    previewToken: string,
    now = Date.now()
  ): { state: "pending"; plan: TPlan } | { state: "applied"; result: TResult } {
    const record = this.get(previewToken, now);
    if (record.state === "applied") return { state: "applied", result: record.result };
    if (record.state === "applying") {
      throw new Error("this preview is already being applied");
    }
    if (record.state === "failed") {
      throw new Error(record.failure);
    }
    this.records.set(previewToken, { ...record, state: "applying" });
    return { state: "pending", plan: record.plan };
  }

  reset(previewToken: string): void {
    const record = this.records.get(previewToken);
    if (record && record.state === "applying") {
      this.records.set(previewToken, { ...record, state: "pending" });
    }
  }

  markApplied(previewToken: string, result: TResult): void {
    const record = this.records.get(previewToken);
    if (!record) throw new Error("preview token is invalid");
    this.records.set(previewToken, {
      state: "applied",
      expiresAt: record.expiresAt,
      plan: record.plan,
      result
    });
  }

  markFailed(previewToken: string, failure: string): void {
    const record = this.records.get(previewToken);
    if (!record) return;
    this.records.set(previewToken, {
      state: "failed",
      expiresAt: record.expiresAt,
      plan: record.plan,
      failure
    });
  }

  private get(previewToken: string, now: number): PreviewRecord<TPlan, TResult> {
    if (previewToken.length < 20 || previewToken.length > 256) {
      throw new Error("preview token is invalid");
    }
    const record = this.records.get(previewToken);
    if (!record) throw new Error("preview token is invalid or belongs to a previous server process");
    if (record.expiresAt <= now) {
      this.records.delete(previewToken);
      throw new Error("preview token has expired; create a new preview");
    }
    return record;
  }

  private prune(now: number): void {
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(key);
    }
  }
}
