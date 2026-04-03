export interface Transaction {
  id: string;
  name: string;
  amount: number;
  type: string;
  recurrence: string;
  startDate: string;
  autopay: boolean;
  tags: string;
  highlight: string;
}

export interface OverrideData {
  id?: string;
  transactionId?: string;
  occurrenceDate?: string;
  name?: string;
  amount?: number;
  type?: string;
  deleted?: boolean;
  movedTo?: string;
}

export interface AppState {
  transactions: Transaction[];
  overrides: Record<string, OverrideData>;
  balanceResets: Record<string, number>;
  startingBalance: number;
}
