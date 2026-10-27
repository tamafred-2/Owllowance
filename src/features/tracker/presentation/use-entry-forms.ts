import { useRef, useState } from 'react';
import type { ActivityItem, EntryCommand, OpeningCommand, TransferCommand, WalletKind } from '../../../domain/ledger';
import { eventTime } from '../../../domain/date';
import { ValidationError } from '../../../domain/money';
import { useTracker } from './tracker-context';

function saveError(error: unknown): string {
  return error instanceof ValidationError ? error.message : 'Could not save to this device. Your input is still here. Check free space and try again.';
}

export function useWalletSetup(onSaved?: () => void) {
  const { service, refresh } = useTracker();
  const [name, setName] = useState('Cash');
  const [kind, setKind] = useState<WalletKind>('cash');
  const [amount, setAmount] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: OpeningCommand } | null>(null);

  async function submit(skip = false) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = skip ? ['Cash', '0', 'cash'] as const : [name, amount, kind] as const;
      const fingerprint = JSON.stringify(values);
      if (pending.current?.fingerprint !== fingerprint) {
        pending.current = { fingerprint, command: service.prepareWallet(values[0], values[1], values[2]) };
      }
      await service.repository.createWallet(pending.current.command);
      await refresh();
      onSaved?.();
    } catch (failure) { setError(saveError(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { name, setName, kind, setKind, amount, setAmount, busy, error, submit };
}

export type EntryDraft = { walletId?: string; categoryId?: string; amount?: string; note?: string; localDate?: string };

// New entries (optionally prefilled for duplicates) or, with `editing`, a revision-checked edit.
export function useTransactionForm(onSaved: (walletId: string) => void, type: 'expense' | 'income' = 'expense', initial: EntryDraft = {}, editing?: ActivityItem) {
  const { service, overview, refresh } = useTracker();
  const [amount, setAmount] = useState(initial.amount ?? '');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [selectedWalletId, setWalletId] = useState(initial.walletId ?? '');
  const walletId = selectedWalletId || overview?.wallet?.id || '';
  const wallet = [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])].find(item => item.id === walletId);
  const [note, setNote] = useState(initial.note ?? '');
  const [localDate, setLocalDate] = useState(initial.localDate ?? eventTime().localDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: EntryCommand } | null>(null);

  async function submit() {
    if (!service || inFlight.current || (!editing && !overview?.wallet)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = { walletId, categoryId, amount, note, type, localDate };
      if (editing) {
        await service.repository.updateEntry(service.prepareEdit(editing, values));
      } else {
        const fingerprint = JSON.stringify(values);
        if (pending.current?.fingerprint !== fingerprint) {
          pending.current = { fingerprint, command: service.prepareEntry(values) };
        }
        if (type === 'income') await service.repository.addIncome(pending.current.command);
        else await service.repository.addExpense(pending.current.command);
      }
      // A committed write remains successful even if refreshing the query fails.
      await refresh();
      onSaved(walletId);
    } catch (failure) { setError(saveError(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { walletId, setWalletId, wallet, amount, setAmount, categoryId, setCategoryId, note, setNote, localDate, setLocalDate, busy, error, submit };
}

export function useTransferForm(onSaved: (walletId: string) => void, initial: { fromWalletId?: string; toWalletId?: string }) {
  const { service, overview, refresh } = useTracker();
  const wallets = overview?.wallets ?? [];
  const [fromWalletId, setFromWalletId] = useState(initial.fromWalletId ?? wallets[0]?.id ?? '');
  const [toWalletId, setToWalletId] = useState(initial.toWalletId ?? wallets.find(item => item.id !== (initial.fromWalletId ?? wallets[0]?.id))?.id ?? '');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [localDate, setLocalDate] = useState(eventTime().localDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: TransferCommand } | null>(null);

  async function submit() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = { fromWalletId, toWalletId, amount, fee, note, localDate };
      const fingerprint = JSON.stringify(values);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, command: service.prepareTransfer(values) };
      await service.repository.addTransfer(pending.current.command);
      await refresh();
      onSaved(fromWalletId);
    } catch (failure) { setError(saveError(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { fromWalletId, setFromWalletId, toWalletId, setToWalletId, amount, setAmount, fee, setFee, note, setNote, localDate, setLocalDate, busy, error, submit };
}
