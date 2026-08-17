import { OperationPreviewStore } from "./operation-preview-store.js";
import {
  ReceiptMemoryStore,
  type ReceiptEvidenceGroup,
  type ReceiptMemoryDeletePreview,
  type ReceiptMemoryPurgePreview,
  type ReceiptMemorySettingsPreview,
  type ReceiptMemoryStatus
} from "./receipt-memory-store.js";

type MutationResult = {
  applied: boolean;
  alreadyApplied: boolean;
  status: ReceiptMemoryStatus;
};

function validateSafeText(value: string, field: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f<>`]/.test(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function validateRecordId(value: string): string {
  if (!/^evi_[a-f0-9]{24}$/.test(value)) throw new Error("receipt memory record id is invalid");
  return value;
}

function validateMonth(value: string | undefined, field: string): string | undefined {
  if (value !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM`);
  }
  return value;
}

export class ReceiptMemoryController {
  constructor(
    private readonly store = new ReceiptMemoryStore(),
    private readonly settingsPreviews = new OperationPreviewStore<
      ReceiptMemorySettingsPreview,
      MutationResult
    >(),
    private readonly deletePreviews = new OperationPreviewStore<
      ReceiptMemoryDeletePreview,
      MutationResult
    >(),
    private readonly purgePreviews = new OperationPreviewStore<
      ReceiptMemoryPurgePreview,
      MutationResult
    >()
  ) {}

  status() {
    return this.store.status();
  }

  readiness() {
    return this.store.readiness();
  }

  search(input: {
    query?: string | undefined;
    categoryId?: string | undefined;
    monthFrom?: string | undefined;
    monthTo?: string | undefined;
    limit?: number | undefined;
  }) {
    const query = input.query === undefined ? undefined : validateSafeText(input.query, "query");
    const categoryId = input.categoryId;
    if (categoryId !== undefined && !/^[A-Za-z0-9._:-]{1,200}$/.test(categoryId)) {
      throw new Error("categoryId is invalid");
    }
    const monthFrom = validateMonth(input.monthFrom, "monthFrom");
    const monthTo = validateMonth(input.monthTo, "monthTo");
    if (monthFrom && monthTo && monthFrom > monthTo) {
      throw new Error("monthFrom cannot be later than monthTo");
    }
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("limit must be an integer from 1 to 100");
    }
    return this.store.search({ query, categoryId, monthFrom, monthTo, limit });
  }

  get(recordId: string) {
    return this.store.get(validateRecordId(recordId));
  }

  async previewSettings(input: { enabled: boolean; retentionDays?: number | undefined }) {
    const plan = await this.store.previewSettings(input);
    const preview = this.settingsPreviews.create(plan);
    return {
      operation: "change local receipt memory settings",
      ...plan,
      ...preview,
      requiresConfirmation: true,
      note: "No local data has changed. Reducing retention deletes evidence older than the proposed window when applied."
    };
  }

  async applySettings(input: { previewToken: string; confirmed: true }): Promise<MutationResult> {
    return this.applyPreview(input, this.settingsPreviews, (plan) => this.store.applySettings(plan));
  }

  async previewDelete(recordId: string) {
    const plan = await this.store.previewDelete(validateRecordId(recordId));
    const preview = this.deletePreviews.create(plan);
    return {
      operation: "delete one local receipt memory record",
      ...plan,
      ...preview,
      requiresConfirmation: true,
      note: "No local data has changed. This deletes only local receipt evidence, never ZenMoney data."
    };
  }

  async applyDelete(input: { previewToken: string; confirmed: true }): Promise<MutationResult> {
    return this.applyPreview(input, this.deletePreviews, (plan) => this.store.applyDelete(plan));
  }

  async previewPurge() {
    const plan = await this.store.previewPurge();
    const preview = this.purgePreviews.create(plan);
    return {
      operation: "purge all local receipt memory evidence",
      ...plan,
      ...preview,
      requiresConfirmation: true,
      note: plan.corrupt
        ? "No local data has changed. Applying resets the corrupt file to disabled safe defaults."
        : "No local data has changed. Applying removes every local evidence record and preserves valid settings."
    };
  }

  async applyPurge(input: { previewToken: string; confirmed: true }): Promise<MutationResult> {
    return this.applyPreview(input, this.purgePreviews, (plan) => this.store.applyPurge(plan));
  }

  recordVerified(input: {
    transactionIds: string[];
    receiptDate: string;
    instrument: number;
    groups: ReceiptEvidenceGroup[];
  }) {
    return this.store.recordVerified(input);
  }

  private async applyPreview<TPlan>(
    input: { previewToken: string; confirmed: true },
    previews: OperationPreviewStore<TPlan, MutationResult>,
    apply: (plan: TPlan) => Promise<ReceiptMemoryStatus>
  ): Promise<MutationResult> {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = previews.begin(input.previewToken);
    if (started.state === "applied") {
      return { ...started.result, applied: false, alreadyApplied: true };
    }
    try {
      const status = await apply(started.plan);
      const result = { applied: true, alreadyApplied: false, status };
      previews.markApplied(input.previewToken, result);
      return result;
    } catch (error) {
      previews.reset(input.previewToken);
      throw error;
    }
  }
}
