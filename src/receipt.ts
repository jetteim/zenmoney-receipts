import type { MatchCandidate, ReceiptFacts, ZenTransaction } from "./types.js";

const DAY_MS = 86_400_000;

function utcDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("date must use YYYY-MM-DD format");
  }
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const check = new Date(timestamp).toISOString().slice(0, 10);
  if (check !== value) {
    throw new Error("date is not a valid calendar day");
  }
  return timestamp;
}

export function shiftDate(value: string, days: number): string {
  return new Date(utcDay(value) + days * DAY_MS).toISOString().slice(0, 10);
}

function normalizeMerchant(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function merchantScore(receiptMerchant: string | undefined, transaction: ZenTransaction): number {
  if (!receiptMerchant) return 0;
  const wanted = normalizeMerchant(receiptMerchant);
  const haystack = normalizeMerchant(
    [transaction.payee, transaction.comment].filter(Boolean).join(" ")
  );
  if (!wanted || !haystack) return 0;
  if (haystack === wanted) return 20;
  if (haystack.includes(wanted) || wanted.includes(haystack)) return 15;

  const wantedWords = new Set(wanted.split(" ").filter((word) => word.length > 2));
  const present = haystack.split(" ").filter((word) => wantedWords.has(word)).length;
  return Math.min(10, present * 5);
}

export function rankReceiptMatches(
  receipt: ReceiptFacts,
  transactions: ZenTransaction[],
  options: { dateWindowDays?: number; amountTolerance?: number } = {}
): MatchCandidate[] {
  const receiptDay = utcDay(receipt.date);
  const dateWindowDays = options.dateWindowDays ?? 3;
  const tolerance = options.amountTolerance ?? Math.max(0.01, receipt.total * 0.002);

  return transactions
    .flatMap((transaction): MatchCandidate[] => {
      if (
        transaction.deleted ||
        !transaction.date ||
        transaction.outcome <= 0 ||
        transaction.income > 0 ||
        (receipt.accountId && transaction.outcomeAccount !== receipt.accountId)
      ) {
        return [];
      }

      const accountAmountDelta = Math.abs(transaction.outcome - receipt.total);
      const operationAmountDelta =
        transaction.opOutcome !== null ? Math.abs(transaction.opOutcome - receipt.total) : Infinity;
      const amountDelta = Math.min(accountAmountDelta, operationAmountDelta);
      if (amountDelta > tolerance) return [];

      let transactionDay: number;
      try {
        transactionDay = utcDay(transaction.date);
      } catch {
        return [];
      }
      const dayDelta = Math.abs(transactionDay - receiptDay) / DAY_MS;
      if (dayDelta > dateWindowDays) return [];

      const reasons: string[] = [];
      let score = amountDelta <= 0.005 ? 50 : 42;
      const amountKind = operationAmountDelta < accountAmountDelta ? "receipt-currency amount" : "account amount";
      reasons.push(
        amountDelta <= 0.005 ? `exact ${amountKind}` : `${amountKind} within tolerance`
      );

      score += Math.max(8, 25 - dayDelta * 6);
      reasons.push(dayDelta === 0 ? "same date" : `${dayDelta}-day date difference`);

      if (receipt.accountId) {
        score += 10;
        reasons.push("requested account");
      }

      const payeeScore = merchantScore(receipt.merchant, transaction);
      if (payeeScore > 0) {
        score += payeeScore;
        reasons.push(payeeScore >= 15 ? "merchant text match" : "partial merchant text match");
      }

      return [{ transaction, score: Math.round(score), reasons }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.transaction.date ?? "").localeCompare(left.transaction.date ?? "")
    )
    .slice(0, 10);
}
