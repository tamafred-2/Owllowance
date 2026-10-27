import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Feedback, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { DueItem } from '../../../domain/ledger';
import { addDays, displayDate, eventTime } from '../../../domain/date';
import { ValidationError } from '../../../domain/money';
import { useTracker } from './tracker-context';

const SHOWN = 5;

export function dueLabel(dueDate: string, today: string): string {
  if (dueDate < today) return `Overdue · ${displayDate(dueDate)}`;
  if (dueDate === today) return 'Due today';
  if (dueDate === addDays(today, 1)) return 'Due tomorrow';
  return `Due ${new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dueDate}T12:00:00Z`))}`;
}

// Home: recurring bills and income that are overdue or due within a week, with Paid / Skip.
export function PaymentsDue() {
  const { service, overview, refresh, error: storageError } = useTracker();
  const { colors, isDark } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const inFlight = useRef(false);
  const today = eventTime().localDate;
  const due = overview?.due ?? [];
  async function act(item: DueItem, kind: 'paid' | 'skip') {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(`${item.recurringId}|${item.dueDate}`); setMessage(null);
    try {
      if (kind === 'paid') await service.repository.payRecurring(service.preparePayment(item));
      else await service.repository.skipRecurring(item.recurringId, item.dueDate);
      await refresh();
      setMessage({ text: kind === 'paid' ? `${item.name} recorded.` : `${item.name} skipped.`, error: false });
    } catch (failure) { setMessage({ text: failure instanceof ValidationError ? failure.message : 'Could not update this payment. Try again.', error: true }); }
    finally { inFlight.current = false; setBusy(null); }
  }
  return <Surface style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText size={18} weight="600">Payments due</AppText>
      <Button label="Manage" variant="quiet" onPress={() => router.push('/plan')} />
    </View>
    {message ? <Feedback error={message.error}>{message.text}</Feedback> : null}
    {due.length ? <View testID="payments-due">
      {due.slice(0, SHOWN).map((item, index) => {
        const tint = categoryColors(item.colorToken, isDark);
        const key = `${item.recurringId}|${item.dueDate}`;
        return <View key={key} style={{ gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ padding: 8, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={item.iconKey as IconName} size={18} color={tint.foreground} /></View>
            <View style={{ flex: 1 }}>
              <AppText size={15} weight="600" numberOfLines={1}>{item.name}</AppText>
              <AppText size={12} tone={item.overdue ? 'error' : 'secondary'}>{`${dueLabel(item.dueDate, today)} · ${item.walletName}`}</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {item.type === 'income' ? <AppText size={15} tone="success">+</AppText> : null}
              <MoneyText value={item.amountMinor} size={15} style={item.type === 'income' ? { color: colors.success } : undefined} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label={item.type === 'income' ? 'Received' : 'Paid'} icon="check" variant="secondary" busy={busy === key} disabled={Boolean(busy) || Boolean(storageError)} onPress={() => { void act(item, 'paid'); }} /></View>
            <View style={{ flex: 1 }}><Button label="Skip" variant="quiet" disabled={Boolean(busy) || Boolean(storageError)} onPress={() => { void act(item, 'skip'); }} /></View>
          </View>
        </View>;
      })}
      {due.length > SHOWN ? <AppText size={12} tone="secondary">{`And ${due.length - SHOWN} more in Plan.`}</AppText> : null}
    </View> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <AppIcon name="plan" size={26} color={colors.accent} />
      <AppText size={13} tone="secondary" style={{ flex: 1 }}>Nothing due this week. Add rent, bills or allowance under Plan to see them here.</AppText>
    </View>}
  </Surface>;
}
