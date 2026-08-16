import { shiftDate } from "./receipt.js";
import type { ZenAccount, ZenTransaction } from "./types.js";

export type SuggestionConfidence = "high" | "medium" | "low";

export interface AccountRecommendation {
  account: ZenAccount;
  basis:
    | "account-hint"
    | "payee-history"
    | "category-history"
    | "recent-use"
    | "single-account"
    | "deterministic-fallback";
  confidence: SuggestionConfidence;
  reason: string;
}

interface RankedAccount {
  account: ZenAccount;
  hintScore: number;
  payeeScore: number;
  categoryScore: number;
  usageScore: number;
  lastUsed: string;
}

function normalized(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalized(value).split(" ").filter((token) => token.length > 1));
}

function textScore(needle: string, haystack: string): number {
  const wanted = normalized(needle);
  const available = normalized(haystack);
  if (!wanted || !available) return 0;
  if (wanted === available) return 100;
  if (available.includes(wanted) || wanted.includes(available)) return 70;

  const wantedTokens = tokens(wanted);
  const availableTokens = tokens(available);
  const overlap = [...wantedTokens].filter((token) => availableTokens.has(token)).length;
  return overlap === 0 ? 0 : Math.min(60, overlap * 20);
}

export function localCalendarDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveReceiptDate(value?: string, now = new Date()) {
  if (value !== undefined) {
    return { value: shiftDate(value, 0), suggested: false as const };
  }
  return {
    value: localCalendarDate(now),
    suggested: true as const,
    basis: "host-local-today" as const,
    confidence: "medium" as const,
    reason: "Receipt date was not identified; using the MCP host's local calendar date as a suggestion."
  };
}

export function validateAccountHint(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error("account hint contains unsupported characters or is too long");
  }
  return trimmed;
}

export function recommendReceiptAccount(input: {
  accounts: ZenAccount[];
  transactions: ZenTransaction[];
  accountHint?: string | undefined;
  payee?: string | undefined;
  tagIds: string[];
}): AccountRecommendation {
  const accountHint = validateAccountHint(input.accountHint);
  const eligible = input.accounts.filter(
    (account) => !account.archive && account.instrument !== null
  );
  if (eligible.length === 0) {
    throw new Error("no active account with a currency instrument is available for this receipt");
  }
  if (eligible.length === 1) {
    return {
      account: eligible[0]!,
      basis: "single-account",
      confidence: "high",
      reason: "This is the only active account that can hold the expense."
    };
  }

  const wantedTags = new Set(input.tagIds);
  const ranked: RankedAccount[] = eligible.map((account) => {
    const history = input.transactions.filter(
      (transaction) =>
        !transaction.deleted &&
        transaction.income <= 0 &&
        transaction.outcome > 0 &&
        transaction.outcomeAccount === account.id
    );
    const payeeMatches = input.payee
      ? history.map((transaction) =>
          textScore(input.payee!, [transaction.payee, transaction.merchant].filter(Boolean).join(" "))
        )
      : [];
    const categoryMatches = history.filter((transaction) =>
      transaction.tag.some((tagId) => wantedTags.has(tagId))
    ).length;
    return {
      account,
      hintScore: accountHint
        ? textScore(accountHint, `${account.title} ${account.type ?? ""}`)
        : 0,
      payeeScore: Math.min(100, payeeMatches.reduce((total, score) => total + score, 0)),
      categoryScore: Math.min(60, categoryMatches * 10),
      usageScore: Math.min(20, history.length),
      lastUsed: history.reduce(
        (latest, transaction) =>
          transaction.date && transaction.date > latest ? transaction.date : latest,
        ""
      )
    };
  });

  ranked.sort(
    (left, right) =>
      right.hintScore - left.hintScore ||
      right.payeeScore - left.payeeScore ||
      right.categoryScore - left.categoryScore ||
      right.lastUsed.localeCompare(left.lastUsed) ||
      right.usageScore - left.usageScore ||
      left.account.title.localeCompare(right.account.title) ||
      left.account.id.localeCompare(right.account.id)
  );
  const selected = ranked[0]!;

  if (selected.hintScore > 0) {
    return {
      account: selected.account,
      basis: "account-hint",
      confidence: selected.hintScore >= 70 ? "high" : "medium",
      reason: "The account name or type is the closest match to the supplied payment hint."
    };
  }
  if (selected.payeeScore > 0) {
    return {
      account: selected.account,
      basis: "payee-history",
      confidence: selected.payeeScore >= 70 ? "high" : "medium",
      reason: "This account has the strongest bounded prior-expense match for the receipt payee."
    };
  }
  if (selected.categoryScore > 0) {
    return {
      account: selected.account,
      basis: "category-history",
      confidence: selected.categoryScore >= 30 ? "medium" : "low",
      reason: "This account has the strongest bounded prior usage for the selected categories."
    };
  }
  if (selected.lastUsed) {
    return {
      account: selected.account,
      basis: "recent-use",
      confidence: "low",
      reason: "No closer semantic evidence was available; this is the most recently used eligible expense account."
    };
  }
  return {
    account: selected.account,
    basis: "deterministic-fallback",
    confidence: "low",
    reason: "No semantic or usage evidence was available; this is a deterministic active-account fallback."
  };
}
