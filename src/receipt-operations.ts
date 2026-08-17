import type { ZenTransaction } from "./types.js";
import type {
  ReceiptEvidenceGroup,
  ReceiptMemoryReviewReadiness
} from "./receipt-memory-store.js";

export interface ReceiptPart {
  amount: number;
  tagIds: string[];
}

export interface PlannedReceiptPart extends ReceiptPart {
  transactionId: string;
}

export interface ExistingReceiptAllocation {
  source: ZenTransaction;
  parts: PlannedReceiptPart[];
}

export interface ReconciliationPlan {
  receiptTotal: number;
  sourceTotal: number;
  allocatedTotal: number;
  allocations: ExistingReceiptAllocation[];
  evidenceGroups: ReceiptEvidenceGroup[];
}

export interface NewReceiptPlan {
  receiptTotal: number;
  accountId: string;
  instrument: number;
  date: string;
  payee: string | null;
  comment: string | null;
  parts: PlannedReceiptPart[];
  evidenceGroups: ReceiptEvidenceGroup[];
}

export type ReceiptMemoryResult =
  | {
      status: "disabled" | "no-evidence" | "recorded" | "already-recorded";
      recordId?: string;
      reviewReadiness: ReceiptMemoryReviewReadiness;
    }
  | {
      status: "unavailable";
      error: string;
      reviewReadiness: ReceiptMemoryReviewReadiness | null;
    };

export interface ReceiptOperationResult {
  applied: boolean;
  alreadyApplied: boolean;
  verified: boolean;
  receiptTotal: number;
  transactionIds: string[];
  transactions: ZenTransaction[];
  receiptMemory: ReceiptMemoryResult;
}

export function cents(value: number): number {
  return Math.round(value * 100);
}

export function sameAmount(left: number, right: number): boolean {
  return cents(left) === cents(right);
}

export function sameTags(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
