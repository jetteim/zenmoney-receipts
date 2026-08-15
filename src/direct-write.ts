export interface DirectExpenseInput {
  id: string;
  changed: number;
  serverTimestamp: number;
  user: string | number;
  accountId: string;
  instrument: number;
  amount: number;
  tagIds: string[];
  merchant: string | null;
  payee: string | null;
  comment: string | null;
  date: string;
}

export function buildExpenseDiff(input: DirectExpenseInput) {
  return {
    currentClientTimestamp: input.changed,
    serverTimestamp: input.serverTimestamp,
    transaction: [
      {
        id: input.id,
        changed: input.changed,
        created: input.changed,
        user: input.user,
        deleted: false,
        hold: null,
        viewed: false,
        incomeInstrument: input.instrument,
        incomeAccount: input.accountId,
        income: 0,
        incomeBankID: null,
        outcomeInstrument: input.instrument,
        outcomeAccount: input.accountId,
        outcome: input.amount,
        outcomeBankID: null,
        opIncome: null,
        opIncomeInstrument: null,
        opOutcome: null,
        opOutcomeInstrument: null,
        tag: input.tagIds,
        merchant: input.merchant,
        payee: input.payee,
        originalPayee: null,
        comment: input.comment,
        date: input.date,
        mcc: null,
        latitude: null,
        longitude: null,
        reminderMarker: null,
        qrCode: null
      }
    ]
  };
}
