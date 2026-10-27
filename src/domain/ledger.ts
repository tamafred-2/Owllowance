import type { BackupEnvelope } from './backup';
import type { EventTime } from './date';
import type { Frequency } from './recurring';

export type WalletKind = 'cash' | 'bank' | 'ewallet';
export const walletKindLabels: Record<WalletKind, string> = { cash: 'Cash', bank: 'Bank', ewallet: 'E-wallet' };
// openingMinor: the starting balance the wallet was created with (editable, never income).
export type Wallet = { id: string; name: string; kind: WalletKind; archivedAt: string | null; balanceMinor: number; openingMinor: number };
export type CategoryType = 'expense' | 'income';
export type Category = { id: string; name: string; iconKey: string; colorToken: string };
export type ManagedCategory = Category & { type: CategoryType; archivedAt: string | null; custom: boolean };
export type TransactionType = 'expense' | 'income' | 'opening' | 'transfer';
export type ActivityItem = EventTime & {
  id: string; type: TransactionType; note: string; revision: number;
  amountMinor: number; walletId: string; walletName: string;
  categoryId: string | null; categoryName: string | null; iconKey: string | null; colorToken: string | null;
  // Transfers: the other wallet. Fee expenses: the transfer they belong to.
  counterpartyName: string | null; counterpartyId: string | null; linkedId: string | null;
  // Transfers: the linked fee charged to this row's wallet (source side only).
  feeMinor: number | null;
  // Money moved into (negative) or out of (positive) a savings goal; managed from the goal.
  goalId: string | null;
  // Money borrowed, lent or repaid; managed from the debt.
  debtId: string | null; debtDirection: DebtDirection | null;
};
export type HistoryFilter = {
  walletId?: string; type?: 'expense' | 'income' | 'transfer'; categoryId?: string;
  fromDate?: string; toDateExclusive?: string; search?: string; linkedId?: string;
  // Lists fee expenses as their own rows (exports) instead of folding them into transfers.
  separateFees?: boolean;
};
export type BudgetPeriod = 'monthly' | 'weekly' | 'custom';
export type Budget = {
  id: string; categoryId: string; categoryName: string; iconKey: string; colorToken: string;
  period: BudgetPeriod; startDate: string | null; endDate: string | null; limitMinor: number;
  // Current window (start inclusive, end exclusive) and posted spending inside it.
  windowStart: string; windowEnd: string; spentMinor: number;
};
export type ThemePreference = 'system' | 'light' | 'dark';
// hiddenBalances: wallet IDs (or NET_WORTH) whose balance is masked on screen.
export type WalletView = 'grid' | 'list' | 'cards';
// deckWallet: the wallet last left in front of the card view.
// appLock: ask for the phone's fingerprint/face/PIN when opening; kept per device, not restored from backups.
export type Settings = { theme: ThemePreference; walletView: WalletView; deckWallet: string | null; reminders: boolean; guideSeen: boolean; hiddenBalances: string[]; reduceMotion: boolean; lastBackupAt: string | null; appLock: boolean };
export const NET_WORTH = 'net-worth';
export const defaultSettings: Settings = { theme: 'system', walletView: 'grid', deckWallet: null, reminders: false, guideSeen: false, hiddenBalances: [], reduceMotion: false, lastBackupAt: null, appLock: false };
export type RecurringRule = {
  id: string; name: string; type: CategoryType; amountMinor: number; walletId: string; walletName: string;
  categoryId: string; categoryName: string; iconKey: string; colorToken: string;
  frequency: Frequency; every: number; startDate: string; paused: boolean; nextDue: string | null;
};
// One unhandled occurrence: overdue (before today) or due within the next week.
export type DueItem = Omit<RecurringRule, 'id' | 'paused' | 'nextDue' | 'frequency' | 'every' | 'startDate'> & { recurringId: string; dueDate: string; overdue: boolean };
export type RecurringCommand = {
  id: string; name: string; type: CategoryType; amountMinor: number; walletId: string; categoryId: string;
  frequency: Frequency; every: number; startDate: string;
};
export type Goal = {
  id: string; name: string; description: string; imageUri: string | null; targetMinor: number; targetDate: string | null; iconKey: string; colorToken: string;
  archivedAt: string | null; savedMinor: number;
  // Has moved money with a wallet, so it keeps its history: archive instead of delete.
  hasWalletMoves: boolean;
  // Set when the goal was used ("I bought it"); completed goals are also archived.
  completedAt: string | null;
};
// Spends a goal: its money returns to the wallet and the purchase is recorded there as an expense.
export type CompleteGoalCommand = EventTime & { goalId: string; moveId: string; expenseId: string; walletId: string; categoryId: string; amountMinor: number; note: string };
// owe: I owe this person; owed: they owe me.
export type DebtDirection = 'owe' | 'owed';
export type Debt = {
  id: string; name: string; direction: DebtDirection; dueDate: string | null; note: string; archivedAt: string | null;
  balanceMinor: number; hasWalletMoves: boolean;
};
// Positive increases what is owed, negative pays it down. walletId null records it without moving wallet money.
export type DebtEntry = { id: string; debtId: string; amountMinor: number; localDate: string; note: string; walletId: string | null; walletName: string | null };
export type DebtEntryCommand = EventTime & { id: string; debtId: string; amountMinor: number; walletId: string | null; note: string };
export type DebtCommand = { id: string; name: string; direction: DebtDirection; dueDate: string | null; note: string; initial?: DebtEntryCommand };
export type Streak = { current: number; best: number; loggedToday: boolean };
// walletId is null for amounts recorded before goals used wallets.
export type GoalContribution = { id: string; goalId: string; amountMinor: number; localDate: string; note: string; walletId: string | null; walletName: string | null };
export type GoalCommand = { id: string; name: string; description: string; imageUri: string | null; targetMinor: number; targetDate: string | null; iconKey: string; colorToken: string };
// Positive moves money from the wallet into the goal; negative moves it back out to the wallet.
export type ContributionCommand = EventTime & { id: string; goalId: string; walletId: string; amountMinor: number; note: string };
export type PayRecurringCommand = EntryCommand & { recurringId: string; dueDate: string };
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
  due: DueItem[];
  goals: Goal[];
  debts: Debt[];
  // Totals of open debts: what I owe and what is owed to me.
  oweMinor: number; owedMinor: number;
  streak: Streak;
  settings: Settings;
  restoreSnapshotAt: string | null;
};
export type Report = {
  incomeMinor: number; expenseMinor: number;
  byCategory: { categoryId: string; name: string; iconKey: string; colorToken: string; amountMinor: number; count: number }[];
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
export type EditTransferCommand = TransferCommand & { revision: number };
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
  setStartingBalance(walletId: string, amountMinor: number): Promise<void>;
  renameWallet(walletId: string, name: string): Promise<void>;
  setWalletArchived(walletId: string, archived: boolean): Promise<void>;
  addExpense(command: EntryCommand): Promise<void>;
  addIncome(command: EntryCommand): Promise<void>;
  addTransfer(command: TransferCommand): Promise<void>;
  updateTransfer(command: EditTransferCommand): Promise<void>;
  updateEntry(command: EditEntryCommand): Promise<void>;
  deleteTransaction(id: string, revision: number): Promise<void>;
  categories(): Promise<ManagedCategory[]>;
  saveCategory(command: CategoryCommand): Promise<void>;
  setCategoryArchived(id: string, archived: boolean): Promise<void>;
  saveBudget(command: BudgetCommand): Promise<void>;
  deleteBudget(id: string): Promise<void>;
  report(fromDate: string, toDateExclusive: string): Promise<Report>;
  saveSettings(settings: Partial<Omit<Settings, 'hiddenBalances'>>): Promise<void>;
  setBalanceHidden(target: string, hidden: boolean): Promise<void>;
  recurring(): Promise<RecurringRule[]>;
  saveRecurring(command: RecurringCommand): Promise<void>;
  setRecurringPaused(id: string, paused: boolean): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
  payRecurring(command: PayRecurringCommand): Promise<void>;
  skipRecurring(recurringId: string, dueDate: string): Promise<void>;
  saveGoal(command: GoalCommand): Promise<void>;
  setGoalArchived(id: string, archived: boolean): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  goalContributions(goalId: string): Promise<GoalContribution[]>;
  addContribution(command: ContributionCommand): Promise<void>;
  deleteContribution(id: string): Promise<void>;
  completeGoal(command: CompleteGoalCommand): Promise<void>;
  saveDebt(command: DebtCommand): Promise<void>;
  setDebtArchived(id: string, archived: boolean): Promise<void>;
  deleteDebt(id: string): Promise<void>;
  debtEntries(debtId: string): Promise<DebtEntry[]>;
  addDebtEntry(command: DebtEntryCommand): Promise<void>;
  deleteDebtEntry(id: string): Promise<void>;
  exportBackup(appVersion: string): Promise<BackupEnvelope>;
  restoreBackup(envelope: BackupEnvelope): Promise<void>;
  undoRestore(): Promise<void>;
}
