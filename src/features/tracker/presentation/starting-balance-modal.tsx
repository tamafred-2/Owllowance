import { useRef, useState } from 'react';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Feedback, FormField } from '../../../design-system/primitives';
import type { Wallet } from '../../../domain/ledger';
import { parseAmount, ValidationError } from '../../../domain/money';
import { useTracker } from './tracker-context';

// Corrects what the wallet held when it was added; later entries stay as they are.
export function StartingBalanceModal({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const { service, refresh, error: storageError } = useTracker();
  const [amount, setAmount] = useState((wallet.openingMinor / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function save() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await service.repository.setStartingBalance(wallet.id, parseAmount(amount, true));
      await refresh();
      onClose();
    } catch (failure) {
      setError(failure instanceof ValidationError ? failure.message : 'Could not update this wallet. Try again.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <AppModal title="Starting balance" visible onClose={() => { if (!busy) onClose(); }}>
    <AppText size={14} tone="secondary">{`What ${wallet.name} held when you started. It is not income, and entries after it stay the same.`}</AppText>
    <FormField label="Starting balance (PHP)" value={amount} onChangeText={value => { setAmount(value); setError(null); }} keyboardType="decimal-pad" editable={!busy} selectTextOnFocus />
    {error ? <Feedback error>{error}</Feedback> : null}
    <Button label="Save starting balance" busy={busy} disabled={Boolean(storageError)} onPress={() => { void save(); }} />
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={onClose} />
  </AppModal>;
}
