export type JsonObject = Record<string, unknown>;

export interface Backend {
  call(tool: string, input?: JsonObject): Promise<unknown>;
  close(): Promise<void>;
}

export interface ZenAccount {
  id: string;
  title: string;
  type: string | null;
  instrument: number | null;
  archive: boolean;
}

export interface ZenTag {
  id: string;
  changed: number | null;
  title: string;
  parent: string | null;
  showIncome: boolean;
  showOutcome: boolean;
  budgetIncome: boolean;
  budgetOutcome: boolean;
  required: boolean | null;
  retired: boolean;
  archive: boolean;
}

export interface ZenTransaction {
  id: string;
  changed: number | null;
  date: string | null;
  incomeAccount: string | null;
  outcomeAccount: string | null;
  income: number;
  outcome: number;
  incomeInstrument: number | null;
  outcomeInstrument: number | null;
  opOutcome: number | null;
  opOutcomeInstrument: number | null;
  tag: string[];
  merchant: string | null;
  payee: string | null;
  comment: string | null;
  hold: boolean;
  deleted: boolean;
}

export interface ReceiptFacts {
  date: string;
  total: number;
  merchant?: string;
  currency?: string;
  accountId?: string;
}

export interface MatchCandidate {
  transaction: ZenTransaction;
  score: number;
  reasons: string[];
}
