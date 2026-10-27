import type {
  ActivityItem, BudgetCommand, BudgetPeriod, CategoryCommand, CategoryType, DueItem, EditEntryCommand, EntryCommand, LedgerRepository,
  ContributionCommand, EditTransferCommand, GoalCommand, OpeningCommand, PayRecurringCommand, RecurringCommand, TransferCommand, WalletKind,
} from '../../../domain/ledger';
import type { Frequency } from '../../../domain/recurring';
import { addDays, assertLocalDate, eventTime, eventTimeOn } from '../../../domain/date';
import { parseAmount, ValidationError } from '../../../domain/money';

export class TrackerService {
  constructor(readonly repository: LedgerRepository, private readonly uuid: () => string) {}

  prepareWallet(name: string, amount: string, walletKind: WalletKind = 'cash'): OpeningCommand {
    const walletName = name.trim();
    if (!walletName || walletName.length > 60) throw new ValidationError('Enter a wallet name, up to 60 characters.');
    return { id: this.uuid(), walletId: this.uuid(), walletName, walletKind, amountMinor: parseAmount(amount, true), ...eventTime() };
  }

  prepareEntry(input: { walletId: string; categoryId: string; amount: string; note: string; localDate?: string }): EntryCommand {
    if (!input.categoryId) throw new ValidationError('Choose a category.');
    const note = input.note.trim();
    if (note.length > 500) throw new ValidationError('Keep notes within 500 characters.');
    return {
      id: this.uuid(), walletId: input.walletId, categoryId: input.categoryId,
      amountMinor: parseAmount(input.amount), note, ...this.when(input.localDate),
    };
  }

  // Unchanged dates keep their original time context; a new date gets the current time of day.
  prepareEdit(original: ActivityItem, input: { walletId: string; categoryId: string; amount: string; note: string; localDate: string }): EditEntryCommand {
    const note = input.note.trim();
    if (!input.categoryId) throw new ValidationError('Choose a category.');
    if (note.length > 500) throw new ValidationError('Keep notes within 500 characters.');
    const time = input.localDate === original.localDate
      ? { occurredAt: original.occurredAt, localDate: original.localDate, timeZone: original.timeZone, offsetMinutes: original.offsetMinutes }
      : eventTimeOn(input.localDate);
    return { id: original.id, revision: original.revision, walletId: input.walletId, categoryId: input.categoryId, amountMinor: parseAmount(input.amount), note, ...time };
  }

  prepareTransfer(input: { fromWalletId: string; toWalletId: string; amount: string; fee: string; note: string; localDate?: string }): TransferCommand {
    if (!input.fromWalletId || !input.toWalletId) throw new ValidationError('Choose both wallets.');
    if (input.fromWalletId === input.toWalletId) throw new ValidationError('Choose two different wallets.');
    const note = input.note.trim();
    if (note.length > 500) throw new ValidationError('Keep notes within 500 characters.');
    const amountMinor = parseAmount(input.amount);
    const feeMinor = input.fee.trim() ? parseAmount(input.fee, true) : 0;
    if (feeMinor > amountMinor) throw new ValidationError("The fee can't be more than the amount you send.");
    return {
      id: this.uuid(), toEntryId: this.uuid(), feeId: this.uuid(), fromWalletId: input.fromWalletId, toWalletId: input.toWalletId,
      amountMinor, feeMinor, note, ...this.when(input.localDate),
    };
  }

  // An unchanged date keeps the transfer's original time context.
  prepareTransferEdit(original: ActivityItem, input: { fromWalletId: string; toWalletId: string; amount: string; fee: string; note: string; localDate: string }): EditTransferCommand {
    const command = this.prepareTransfer(input);
    const time = input.localDate === original.localDate
      ? { occurredAt: original.occurredAt, localDate: original.localDate, timeZone: original.timeZone, offsetMinutes: original.offsetMinutes } : {};
    return { ...command, ...time, id: original.id, revision: original.revision };
  }

  prepareCategory(input: { id?: string; type: CategoryType; name: string; iconKey: string; colorToken: string }): CategoryCommand {
    return { id: input.id ?? this.uuid(), type: input.type, name: input.name, iconKey: input.iconKey, colorToken: input.colorToken };
  }

  // The form's end date is inclusive; storage keeps an exclusive end.
  prepareBudget(input: { id?: string; categoryId: string; period: BudgetPeriod; limit: string; startDate: string; endDate: string }): BudgetCommand {
    if (!input.categoryId) throw new ValidationError('Choose a category.');
    let startDate: string | null = null, endDate: string | null = null;
    if (input.period === 'custom') {
      assertLocalDate(input.startDate); assertLocalDate(input.endDate);
      if (input.endDate < input.startDate) throw new ValidationError('End date must be on or after the start date.');
      startDate = input.startDate; endDate = addDays(input.endDate, 1);
    }
    return { id: input.id ?? this.uuid(), categoryId: input.categoryId, period: input.period, startDate, endDate, limitMinor: parseAmount(input.limit) };
  }

  prepareRecurring(input: { id?: string; name: string; type: CategoryType; amount: string; walletId: string; categoryId: string; frequency: Frequency; every: string; startDate: string }): RecurringCommand {
    if (!input.walletId) throw new ValidationError('Choose a wallet.');
    if (!input.categoryId) throw new ValidationError('Choose a category.');
    const every = Number(input.every);
    if (!/^\d{1,3}$/.test(input.every.trim())) throw new ValidationError(input.frequency === 'monthly' ? 'Enter a day of the month from 1 to 31.' : 'Enter how many days between payments.');
    return { id: input.id ?? this.uuid(), name: input.name, type: input.type, amountMinor: parseAmount(input.amount), walletId: input.walletId,
      categoryId: input.categoryId, frequency: input.frequency, every, startDate: input.startDate };
  }

  // Paying on or after the due date records it on the due date; paying early records it today.
  preparePayment(item: DueItem): PayRecurringCommand {
    const today = eventTime().localDate;
    return { id: this.uuid(), recurringId: item.recurringId, dueDate: item.dueDate, walletId: item.walletId, categoryId: item.categoryId,
      amountMinor: item.amountMinor, note: item.name, ...(item.dueDate < today ? eventTimeOn(item.dueDate) : eventTime()) };
  }

  prepareGoal(input: { id?: string; name: string; target: string; targetDate: string | null; iconKey: string; colorToken: string }): GoalCommand {
    return { id: input.id ?? this.uuid(), name: input.name, targetMinor: parseAmount(input.target), targetDate: input.targetDate, iconKey: input.iconKey, colorToken: input.colorToken };
  }

  // Taking out is stored as a negative contribution.
  prepareContribution(input: { goalId: string; amount: string; takeOut: boolean; localDate: string; note: string }): ContributionCommand {
    const amount = parseAmount(input.amount);
    return { id: this.uuid(), goalId: input.goalId, amountMinor: input.takeOut ? -amount : amount, localDate: input.localDate, note: input.note.trim() };
  }

  private when(localDate?: string) {
    return localDate && localDate !== eventTime().localDate ? eventTimeOn(localDate) : eventTime();
  }
}
