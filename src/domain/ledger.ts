import type { BackupEnvelope } from './backup';
import type { EventTime } from './date';

export type WalletKind = 'cash' | 'bank' | 'ewallet';
export const walletKindLabels: Record<WalletKind, string> = { cash: 'Cash', bank: 'Bank', ewallet: 'E-wallet' };
export type Wallet = { id: string; name: string; kind: WalletKind; archivedAt: string | null; balanceMinor: number };
export type CategoryType = 'expense' | 'income';
export type Category = { id: string; name: string; iconKey: string; colorToken: string };
export type ManagedCategory = Category & { type: CategoryType; archivedAt: string | null; custom: boolean };
export type TransactionType = 'expense' | 'income' | 'opening' | 'transfer';
export type ActivityItem = EventTime & {
  id: string; type: TransactionType; note: string; revision: number;
  amountMinor: number; walletId: string; walletName: string;
  categoryId: string | null; categoryName: string | null; iconKey: string | null; colorToken: string | null;
  // Transfers: the other wallet. Fee expenses: the transfer they belong to.
  counterpartyName: string | null; linkedId: string | null;
};
export type HistoryFilter = {
  walletId?: string; type?: 'expense' | 'income' | 'transfer'; categoryId?: string;
  fromDate?: string; toDateExclusive?: string; search?: string;
};
export type BudgetPeriod = 'monthly' | 'weekly' | 'custom';
export type Budget = {
  id: string; categoryId: string; categoryName: string; iconKey: string; colorToken: string;
  period: BudgetPeriod; startDate: string | null; endDate: string | null; limitMinor: number;
  // Current window (start inclusive, end exclusive) and posted spending inside it.
  windowStart: string; windowEnd: string; spentMinor: number;
};
export type ThemePreference = 'system' | 'light' | 'dark';
export type Settings = { theme: ThemePreference; hideBalances: boolean; reduceMotion: boolean; lastBackupAt: string | null };
export const defaultSettings: Settings = { theme: 'system', hideBalances: false, reduceMotion: false, lastBackupAt: null };
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
  budgets: Budget[];
  settings: Settings;
  restoreSnapshotAt: string | null;
};
export type Report = {
  incomeMinor: number; expenseMinor: number;
  byCategory: { categoryId: string; name: string; iconKey: string; colorToken: string; amountMinor: number }[];
};
export type OpeningCommand = EventTime & {
  id: string; walletId: string; walletName: string; walletKind?: WalletKind; amountMinor: number;
};
export type EntryCommand = EventTime & {
  id: string; walletId: string; categoryId: string; amountMinor: number; note: string;
};
export type EditEntryCommand = EntryCommand & { revision: number };
export type TransferCommand = EventTime & {
  id: string; toEntryId: string; feeId: string;
  fromWalletId: string; toWalletId: string; amountMinor: number; feeMinor: number; note: string;
};
export type CategoryCommand = { id: string; type: CategoryType; name: string; iconKey: string; colorToken: string };
export type BudgetCommand = {
  id: string; categoryId: string; period: BudgetPeriod; startDate: string | null; endDate: string | null; limitMinor: number;
};

export interface LedgerRepository {
  initialize(): Promise<void>;
  overview(): Promise<Overview>;
  history(offset: number, limit: number, filter?: string | HistoryFilter): Promise<ActivityItem[]>;
  transaction(id: string): Promise<ActivityItem | null>;
  createWallet(command: OpeningCommand): Promise<void>;
  renameWallet(walletId: string, name: string): Promise<void>;
  setWalletArchived(walletId: string, archived: boolean): Promise<void>;
  addExpense(command: EntryCommand): Promise<void>;
  addIncome(command: EntryCommand): Promise<void>;
  addTransfer(command: TransferCommand): Promise<void>;
  updateEntry(command: EditEntryCommand): Promise<void>;
  deleteTransaction(id: string, revision: number): Promise<void>;
  categories(): Promise<ManagedCategory[]>;
  saveCategory(command: CategoryCommand): Promise<void>;
  setCategoryArchived(id: string, archived: boolean): Promise<void>;
  saveBudget(command: BudgetCommand): Promise<void>;
  deleteBudget(id: string): Promise<void>;
  report(fromDate: string, toDateExclusive: string): Promise<Report>;
  saveSettings(settings: Partial<Settings>): Promise<void>;
  exportBackup(appVersion: string): Promise<BackupEnvelope>;
  restoreBackup(envelope: BackupEnvelope): Promise<void>;
  undoRestore(): Promise<void>;
}
