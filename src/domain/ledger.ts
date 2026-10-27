import type { EventTime } from './date';

export type WalletKind = 'cash' | 'bank' | 'ewallet';
export const walletKindLabels: Record<WalletKind, string> = { cash: 'Cash', bank: 'Bank', ewallet: 'E-wallet' };
export type Wallet = { id: string; name: string; kind: WalletKind; archivedAt: string | null; balanceMinor: number };
export type Category = { id: string; name: string; iconKey: string };
export type ActivityItem = EventTime & {
  id: string; type: 'expense' | 'income' | 'opening'; note: string;
  amountMinor: number; walletName: string; categoryName: string | null;
};
export type Overview = {
  wallet: Wallet | null;
  wallets: Wallet[];
  archivedWallets: Wallet[];
  totalBalanceMinor: number;
  todaySpentMinor: number;
  todayIncomeMinor: number;
  categories: Category[];
  incomeCategories: Category[];
  incomeMinor: number;
  incomeCount: number;
  spentMinor: number;
  expenseCount: number;
  recent: ActivityItem[];
};
export type OpeningCommand = EventTime & {
  id: string; walletId: string; walletName: string; walletKind?: WalletKind; amountMinor: number;
};
export type EntryCommand = EventTime & {
  id: string; walletId: string; categoryId: string; amountMinor: number; note: string;
};

export interface LedgerRepository {
  initialize(): Promise<void>;
  overview(): Promise<Overview>;
  history(offset: number, limit: number, walletId?: string): Promise<ActivityItem[]>;
  createWallet(command: OpeningCommand): Promise<void>;
  renameWallet(walletId: string, name: string): Promise<void>;
  setWalletArchived(walletId: string, archived: boolean): Promise<void>;
  addExpense(command: EntryCommand): Promise<void>;
  addIncome(command: EntryCommand): Promise<void>;
}
