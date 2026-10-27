import { useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Feedback, FormField } from '../../../design-system/primitives';
import type { Wallet } from '../../../domain/ledger';
import { ValidationError } from '../../../domain/money';
import { validateWalletName } from '../../../domain/wallet-name';
import { useTracker } from './tracker-context';

// Mount only while renaming so each opening starts from the saved name.
export function RenameWalletModal({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const [name, setName] = useState(wallet.name);
  const [confirmRename, setConfirmRename] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function save() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await service.repository.renameWallet(wallet.id, name);
      await refresh();
      onClose();
    } catch (failure) {
      setError(failure instanceof ValidationError ? failure.message : 'Could not update this wallet. Try again.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  const disabled = busy || Boolean(storageError);
  return <AppModal title={confirmRename ? 'Save this wallet name?' : 'Edit wallet name'} visible onClose={() => { if (!busy) onClose(); }}>
    {confirmRename ? <>
      <AppText>Are you sure you want to rename this wallet to “{name.trim()}”?</AppText>
      <Button label="Confirm rename" busy={busy} disabled={Boolean(storageError)} onPress={() => { void save(); }} />
      <Button label="Back to editing" variant="secondary" disabled={busy} onPress={() => setConfirmRename(false)} />
    </> : <>
      <FormField label="Wallet name" value={name} onChangeText={value => { setName(value); setError(null); }} maxLength={60} editable={!disabled} autoFocus />
      <Button label="Save" disabled={disabled} onPress={() => {
        try {
          validateWalletName(name, [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])], wallet.id);
          Keyboard.dismiss(); setError(null); setConfirmRename(true);
        } catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Check the wallet name.'); }
      }} />
    </>}
    {error ? <Feedback error>{error}</Feedback> : null}
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={onClose} />
  </AppModal>;
}
