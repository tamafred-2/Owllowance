import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Feedback, MoneyText } from '../../../design-system/primitives';
import type { ActivityItem } from '../../../domain/ledger';
import { displayDate } from '../../../domain/date';
import { useTracker } from './tracker-context';
import type { Origin } from './navigation';
import { useOpenSheet } from './sheet-context';

function TransferDetails({ transferId, onClose, onEdit }: { transferId: string; onClose: () => void; onEdit: () => void }) {
  const { service, refresh, error: storageError } = useTracker();
  const [transfer, setTransfer] = useState<ActivityItem | null | undefined>(undefined);
  const [feeMinor, setFeeMinor] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!service) return;
    let live = true;
    void Promise.all([service.repository.transaction(transferId), service.repository.history(0, 1, { linkedId: transferId })])
      .then(([item, fee]) => { if (live) { setTransfer(item); setFeeMinor(fee[0] ? Math.abs(fee[0].amountMinor) : 0); } })
      .catch(() => { if (live) setTransfer(null); });
    return () => { live = false; };
  }, [service, transferId]);
  async function remove() {
    if (!service || !transfer || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await service.repository.deleteTransaction(transfer.id, transfer.revision); await refresh(); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <AppModal title={confirm ? 'Delete this transfer?' : 'Transfer'} visible onClose={() => { if (!busy) onClose(); }}>
    {transfer === undefined ? <AppText tone="secondary">Loading…</AppText> : !transfer ? <AppText>This transfer is no longer available.</AppText> : confirm ? <>
      <AppText size={14} tone="secondary">{`Both wallets${feeMinor ? ' and the linked fee' : ''} will be adjusted back. This can't be undone.`}</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Confirm delete" busy={busy} disabled={Boolean(storageError)} onPress={() => { void remove(); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setConfirm(false)} />
    </> : <>
      <View style={{ gap: 4 }}>
        <AppText weight="600">{`${transfer.walletName} → ${transfer.counterpartyName}`}</AppText>
        <MoneyText value={Math.abs(transfer.amountMinor)} size={28} />
        {feeMinor ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><AppText size={13} tone="secondary">Fee</AppText><MoneyText value={feeMinor} size={13} /></View> : null}
        <AppText size={13} tone="secondary">{displayDate(transfer.localDate)}</AppText>
        {transfer.note ? <AppText size={13} tone="secondary">{transfer.note}</AppText> : null}
      </View>
      <Button label="Edit transfer" icon="edit" variant="secondary" disabled={Boolean(storageError)} onPress={onEdit} />
      <Button label="Delete transfer" icon="delete" variant="quiet" danger disabled={Boolean(storageError)} onPress={() => setConfirm(true)} />
      <Button label="Close" variant="quiet" onPress={onClose} />
    </>}
  </AppModal>;
}

// Income/expense rows open the edit screen; transfers and their fees open the transfer details; goal movements open their goal.
export function useTransactionOpener(origin: Origin, walletId?: string) {
  const [transferId, setTransferId] = useState<string | null>(null);
  const openSheet = useOpenSheet();
  const open = (item: ActivityItem) => {
    if (item.goalId) { router.push({ pathname: '/goal', params: { id: item.goalId } }); return; }
    if (item.debtId) { router.push({ pathname: '/debt', params: { id: item.debtId } }); return; }
    if (item.type === 'transfer' || item.linkedId) { setTransferId(item.linkedId ?? item.id); return; }
    if (item.type === 'opening') return;
    openSheet({ kind: 'entry', edit: item.id });
  };
  const modal = transferId ? <TransferDetails transferId={transferId} onClose={() => setTransferId(null)}
    onEdit={() => { const id = transferId; setTransferId(null); openSheet({ kind: 'transfer', edit: id }); }} /> : null;
  return { open, modal };
}
