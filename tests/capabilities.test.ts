import { describe, expect, it, vi } from "vitest";
import { capabilityReport } from "../src/capabilities.js";
import type { ReceiptMemoryStatus } from "../src/receipt-memory-store.js";

const memory = { enabled: false, corrupt: false, retentionDays: 180, dataLocation: "/synthetic/private/state.json" } as ReceiptMemoryStatus;

describe("effective capabilities", () => {
  it("never inspects operator preferences in hosted mode", async () => {
    const preferences = vi.fn(async () => ({ available: true, enabled: true, revision: 1 }));
    const report = await capabilityReport({ mode: "hosted", connection: () => ({ configured: false }), memory: async () => memory, preferences });
    expect(report.preferences.availability).toBe("unsupported-in-hosted-mode");
    expect(preferences).not.toHaveBeenCalled();
  });
  it("does not equate credentials with live access or disabled recording with unreadable evidence", async () => {
    const report = await capabilityReport({ mode: "local", connection: () => ({ configured: true }), memory: async () => memory });
    expect(report.connection).toMatchObject({ configured: true, liveVerified: false });
    expect(report.receiptMemory).toMatchObject({ recording: "disabled", retainedEvidenceReadable: true, locality: "mcp-machine" });
    expect(report.host.loadedSkills).toBe("unknown");
    expect(report.financialOperations.existingCommentEdit).toBe(false);
  });
  it("isolates failed stores from hosted financial capability reporting without echoing errors", async () => {
    const report = await capabilityReport({ mode: "hosted", connection: () => ({ configured: false }), memory: async () => { throw new Error("private error payload"); } });
    expect(report.financialOperations.availability).toBe("needs-connection");
    expect(report.receiptMemory).toMatchObject({ availability: "unavailable", enabled: null, location: null, locality: "tenant-server-storage" });
    expect(JSON.stringify(report)).not.toContain("private error payload");
  });
  it("reports unknown connection status and corrupt memory as unavailable", async () => {
    const report = await capabilityReport({ mode: "local", connection: () => { throw new Error("unavailable"); }, memory: async () => ({ ...memory, corrupt: true }) });
    expect(report.connection.configured).toBeNull();
    expect(report.receiptMemory.retainedEvidenceReadable).toBe(false);
  });
});
