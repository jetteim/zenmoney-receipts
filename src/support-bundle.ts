import { credentialStatus } from "./credentials.js";
import { OperationJournal } from "./operation-journal.js";
import { PrivacySafeEventStore } from "./observability.js";
import { ReceiptMemoryController } from "./receipt-memory.js";
import { VERSION } from "./version.js";

export interface SupportBundle {
  schemaVersion: "1";
  generatedAt: string;
  privacy: string;
  runtime: {
    connectorVersion: string;
    nodeVersion: string;
    platform: NodeJS.Platform;
    architecture: string;
  };
  configuration: {
    credentialConfigured: boolean;
    credentialSource: string;
    receiptMemory: {
      enabled: boolean;
      corrupt: boolean;
      retentionDays: number | null;
      activeRecordCount: number | null;
    };
  };
  recovery: {
    recent: Awaited<ReturnType<OperationJournal["list"]>>;
  };
  observability: {
    status: Awaited<ReturnType<PrivacySafeEventStore["status"]>>;
    events: Awaited<ReturnType<PrivacySafeEventStore["recent"]>>;
  };
}

export async function buildSupportBundle(input: {
  journal?: OperationJournal;
  events?: PrivacySafeEventStore;
  memory?: ReceiptMemoryController;
  now?: number;
} = {}): Promise<SupportBundle> {
  const journal = input.journal ?? new OperationJournal();
  const events = input.events ?? new PrivacySafeEventStore();
  const memory = input.memory ?? new ReceiptMemoryController();
  const [recent, eventStatus, operationalEvents, memoryStatus] = await Promise.all([
    journal.list(20),
    events.status(),
    events.recent(100),
    memory.status()
  ]);
  const credential = credentialStatus();
  return {
    schemaVersion: "1",
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    privacy:
      "Safe to attach to a support issue after review. Contains no credentials, raw errors, receipt/OCR text, financial values, category names, transaction ids, tenant ids, usernames, or local paths.",
    runtime: {
      connectorVersion: VERSION,
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch
    },
    configuration: {
      credentialConfigured: credential.configured,
      credentialSource: credential.source,
      receiptMemory: {
        enabled: memoryStatus.enabled,
        corrupt: memoryStatus.corrupt,
        retentionDays: memoryStatus.retentionDays,
        activeRecordCount: memoryStatus.activeRecordCount
      }
    },
    recovery: { recent },
    observability: { status: eventStatus, events: operationalEvents }
  };
}
