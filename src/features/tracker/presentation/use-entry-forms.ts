import { useRef, useState } from 'react';
import type { EntryCommand, OpeningCommand, WalletKind } from '../../../domain/ledger';
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

export function useTransactionForm(onSaved: (walletId: string) => void, type: 'expense' | 'income' = 'expense', initialWalletId = '') {
  const { service, overview, refresh } = useTracker();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedWalletId, setWalletId] = useState(initialWalletId);
  const walletId = selectedWalletId || overview?.wallet?.id || '';
  const wallet = overview?.wallets.find(item => item.id === walletId);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: EntryCommand } | null>(null);

  async function submit() {
    if (!service || !overview?.wallet || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = { walletId, categoryId, amount, note, type };
      const fingerprint = JSON.stringify(values);
      if (pending.current?.fingerprint !== fingerprint) {
        pending.current = { fingerprint, command: service.prepareEntry(values) };
      }
      if (type === 'income') await service.repository.addIncome(pending.current.command);
      else await service.repository.addExpense(pending.current.command);
      // A committed write remains successful even if refreshing the query fails.
      await refresh();
      onSaved(walletId);
    } catch (failure) { setError(saveError(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { walletId, setWalletId, wallet, amount, setAmount, categoryId, setCategoryId, note, setNote, busy, error, submit };
}
