import type { ZenTransaction } from "./types.js";

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
}

export interface NewReceiptPlan {
  receiptTotal: number;
  accountId: string;
  instrument: number;
  date: string;
  payee: string | null;
  comment: string | null;
  parts: PlannedReceiptPart[];
}

export interface ReceiptOperationResult {
  applied: boolean;
  alreadyApplied: boolean;
  verified: boolean;
  receiptTotal: number;
  transactionIds: string[];
  transactions: ZenTransaction[];
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
