import type { ReceiptMemoryStatus } from "./receipt-memory-store.js";

export async function capabilityReport(input: {
  mode: "local" | "hosted";
  connection: () => Promise<{ configured: boolean }> | { configured: boolean };
  memory: () => Promise<ReceiptMemoryStatus>;
  preferences?: () => Promise<{ available: boolean; enabled: boolean | null; revision: number | null }>;
}) {
  const [connection, memory] = await Promise.allSettled([Promise.resolve().then(input.connection), Promise.resolve().then(input.memory)]);
  const configured = connection.status === "fulfilled" ? connection.value.configured : null;
  const state = memory.status === "fulfilled" ? memory.value : null;
  const storageAvailable = state !== null && !state.corrupt;
  let preferences: { available: boolean; enabled: boolean | null; revision: number | null } | null = null;
  if (input.mode === "local" && input.preferences) {
    try { preferences = await input.preferences(); } catch { /* Report unavailable without leaking errors. */ }
  }
  return {
    schemaVersion: 1,
    mode: input.mode,
    transport: input.mode === "local" ? "stdio" : "streamable-http",
    connection: { configured, liveVerified: false, verification: "not-performed-by-this-call" },
    financialOperations: {
      implemented: ["receipt-match", "receipt-category", "receipt-reconciliation", "receipt-create", "category-review", "spending-insights", "taxonomy-preview-apply", "no-budget-consolidation"],
      availability: configured === null ? "connection-status-unavailable" : configured ? "configured-requires-live-validation" : "needs-connection",
      writesRequire: ["exact-preview", "explicit-confirmation", "concurrency-check", "post-write-verification"],
      existingCommentEdit: false,
      budgetReferenceMigration: false,
      genericPatchOrDelete: false
    },
    receiptMemory: {
      availability: storageAvailable ? "available" : "unavailable",
      enabled: storageAvailable ? state!.enabled : null,
      retainedEvidenceReadable: storageAvailable,
      recording: !storageAvailable ? "unavailable" : state!.enabled ? "after-verified-receipt-only" : "disabled",
      retentionDays: storageAvailable ? state!.retentionDays : null,
      location: state?.dataLocation ?? null,
      locality: input.mode === "local" ? "mcp-machine" : "tenant-server-storage",
      syncsToZenMoney: false
    },
    host: { loadedSkills: "unknown", model: "unknown", humanApprovalObservable: false, autonomousReviewScheduler: false },
    preferences: {
      supported: input.mode === "local",
      availability: input.mode === "hosted" ? "unsupported-in-hosted-mode" : preferences?.available ? "available" : "unavailable",
      enabled: preferences?.available ? preferences.enabled : null,
      revision: preferences?.available ? preferences.revision : null,
      financialRewrite: false
    },
    remoteNotes: { newReceiptComment: true, existingCommentEdit: "manual-in-zenmoney", localPurgeRemovesComments: false },
    boundary: "Implemented actions remain conditional on valid inputs, current provider state, and confirmation. This report neither tests live access nor observes host skill loading."
  };
}
