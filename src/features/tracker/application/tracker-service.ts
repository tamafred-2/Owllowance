import type {
  ActivityItem, BudgetCommand, BudgetPeriod, CategoryCommand, CategoryType, EditEntryCommand, EntryCommand, LedgerRepository,
  OpeningCommand, TransferCommand, WalletKind,
} from '../../../domain/ledger';
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
    return {
      id: this.uuid(), toEntryId: this.uuid(), feeId: this.uuid(), fromWalletId: input.fromWalletId, toWalletId: input.toWalletId,
      amountMinor: parseAmount(input.amount), feeMinor: input.fee.trim() ? parseAmount(input.fee, true) : 0, note, ...this.when(input.localDate),
    };
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

  private when(localDate?: string) {
    return localDate && localDate !== eventTime().localDate ? eventTimeOn(localDate) : eventTime();
  }
}
