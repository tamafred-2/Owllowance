import type { LedgerRepository, EntryCommand, OpeningCommand, WalletKind } from '../../../domain/ledger';
import { eventTime } from '../../../domain/date';
import { parseAmount, ValidationError } from '../../../domain/money';

export class TrackerService {
  constructor(readonly repository: LedgerRepository, private readonly uuid: () => string) {}

  prepareWallet(name: string, amount: string, walletKind: WalletKind = 'cash'): OpeningCommand {
    const walletName = name.trim();
    if (!walletName || walletName.length > 60) throw new ValidationError('Enter a wallet name, up to 60 characters.');
    return { id: this.uuid(), walletId: this.uuid(), walletName, walletKind, amountMinor: parseAmount(amount, true), ...eventTime() };
  }

  prepareEntry(input: { walletId: string; categoryId: string; amount: string; note: string }): EntryCommand {
    if (!input.categoryId) throw new ValidationError('Choose a category.');
    const note = input.note.trim();
    if (note.length > 500) throw new ValidationError('Keep notes within 500 characters.');
    return {
      id: this.uuid(), walletId: input.walletId, categoryId: input.categoryId,
      amountMinor: parseAmount(input.amount), note, ...eventTime(),
    };
  }
}
