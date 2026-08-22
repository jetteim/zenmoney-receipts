import { OperationPreviewStore } from "./operation-preview-store.js";
import type { HostedTenantDataController, HostedTenantDataSnapshot } from "./hosted-tenant-data.js";
import type { ZenMoneyOAuthController } from "./zenmoney-oauth.js";

interface UnlinkPlan {
  linked: boolean;
  upstreamRevocationAvailable: boolean;
}

interface UnlinkResult {
  applied: boolean;
  alreadyApplied: boolean;
  linked: false;
  upstreamRevocationAttempted: boolean;
}

interface DataDeletionPlan {
  linked: boolean;
  snapshot: HostedTenantDataSnapshot;
}

interface DataDeletionResult {
  applied: boolean;
  alreadyApplied: boolean;
  verified: true;
  linked: false;
  upstreamRevocationAttempted: boolean;
  deleted: { credential: boolean; tenantState: boolean };
}

export class HostedOAuthTools {
  private readonly unlinkPreviews = new OperationPreviewStore<UnlinkPlan, UnlinkResult>();
  private readonly deletionPreviews = new OperationPreviewStore<DataDeletionPlan, DataDeletionResult>();

  constructor(
    private readonly tenantId: string,
    private readonly controller: ZenMoneyOAuthController,
    private readonly upstreamRevocationAvailable: boolean,
    private readonly tenantData: HostedTenantDataController
  ) {}

  status() {
    return this.controller.status(this.tenantId);
  }

  async connectionStatus() {
    const status = await this.controller.status(this.tenantId);
    return {
      configured: status.linked,
      credentialSource: status.linked ? "hosted-encrypted" : "none",
      privacy:
        "The ZenMoney credential is stored as an encrypted tenant envelope and is never returned. Receipt files are not sent to this server."
    };
  }

  begin() {
    return this.controller.begin(this.tenantId);
  }

  async previewUnlink() {
    const status = await this.controller.status(this.tenantId);
    const preview = this.unlinkPreviews.create({
      linked: status.linked,
      upstreamRevocationAvailable: this.upstreamRevocationAvailable
    });
    return {
      operation: "unlink ZenMoney account",
      before: { linked: status.linked },
      proposed: { linked: false },
      upstreamRevocationAvailable: this.upstreamRevocationAvailable,
      ...preview,
      requiresConfirmation: true,
      note: status.linked
        ? "No credential has been removed. Confirmation deletes the encrypted tenant credential after upstream revocation when configured."
        : "No credential is currently linked; confirmation is idempotent."
    };
  }

  async applyUnlink(input: { previewToken: string; confirmed: true }): Promise<UnlinkResult> {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = this.unlinkPreviews.begin(input.previewToken);
    if (started.state === "applied") return { ...started.result, applied: false, alreadyApplied: true };
    const current = await this.controller.status(this.tenantId);
    if (current.linked !== started.plan.linked) {
      this.unlinkPreviews.reset(input.previewToken);
      throw new Error("ZenMoney link state changed after preview; create a new preview");
    }
    const unlinked = await this.controller.unlink(this.tenantId);
    const result: UnlinkResult = {
      applied: unlinked.deleted,
      alreadyApplied: !unlinked.deleted,
      linked: false,
      upstreamRevocationAttempted: unlinked.upstreamRevocationAttempted
    };
    this.unlinkPreviews.markApplied(input.previewToken, result);
    return result;
  }

  async previewDataDeletion() {
    const [status, snapshot] = await Promise.all([
      this.controller.status(this.tenantId),
      this.tenantData.snapshot()
    ]);
    const preview = this.deletionPreviews.create({ linked: status.linked, snapshot });
    return {
      operation: "delete hosted ZenMoney connector data",
      before: {
        linked: status.linked,
        receiptMemoryPresent: snapshot.receiptMemory,
        recoveryJournalPresent: snapshot.recoveryJournal,
        operationalEventsPresent: snapshot.operationalEvents,
        connectorFileCount: snapshot.fileCount
      },
      proposed: {
        linked: false,
        receiptMemoryPresent: false,
        recoveryJournalPresent: false,
        operationalEventsPresent: false,
        connectorFileCount: 0
      },
      upstreamRevocationAvailable: this.upstreamRevocationAvailable,
      ...preview,
      requiresConfirmation: true,
      note:
        "No data has been removed. Confirmation attempts upstream credential revocation, deletes the encrypted ZenMoney credential, then permanently deletes this tenant's hosted receipt memory, recovery journal, and operational events. It does not delete ZenMoney transactions or categories."
    };
  }

  async applyDataDeletion(input: { previewToken: string; confirmed: true }): Promise<DataDeletionResult> {
    if (input.confirmed !== true) throw new Error("confirmed must be true after explicit approval");
    const started = this.deletionPreviews.begin(input.previewToken);
    if (started.state === "applied") return { ...started.result, applied: false, alreadyApplied: true };
    const [currentStatus, currentSnapshot] = await Promise.all([
      this.controller.status(this.tenantId),
      this.tenantData.snapshot()
    ]);
    if (currentStatus.linked !== started.plan.linked || currentSnapshot.digest !== started.plan.snapshot.digest) {
      this.deletionPreviews.reset(input.previewToken);
      throw new Error("hosted tenant data changed after preview; create a new preview");
    }
    const unlinked = await this.controller.unlink(this.tenantId);
    const local = await this.tenantData.delete(started.plan.snapshot.digest);
    if ((await this.controller.status(this.tenantId)).linked) {
      throw new Error("hosted tenant credential deletion could not be verified");
    }
    const result: DataDeletionResult = {
      applied: unlinked.deleted || local.deleted,
      alreadyApplied: !unlinked.deleted && !local.deleted,
      verified: true,
      linked: false,
      upstreamRevocationAttempted: unlinked.upstreamRevocationAttempted,
      deleted: { credential: unlinked.deleted, tenantState: local.deleted }
    };
    this.deletionPreviews.markApplied(input.previewToken, result);
    return result;
  }
}
