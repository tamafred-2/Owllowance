import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Feedback, ToggleRow } from '../../../design-system/primitives';
import { eventTime } from '../../../domain/date';
import { REMINDER_HOUR, reminderPlan, type ReminderPlan } from '../../../domain/reminders';
import { clearReminders, enableReminders, replaceReminders } from '../../../platform/notifications';
import { updateWidgets } from '../../../platform/widgets';
import { PaymentsDue } from './payments-due';
import { useTracker } from './tracker-context';

function atReminderHour(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day, REMINDER_HOUR, 0, 0);
}

// Keeps scheduled reminders in step with Payments due whenever data changes.
export function useReminderSync(): void {
  const { overview } = useTracker();
  const plan = overview ? (overview.settings.reminders ? JSON.stringify(reminderPlan(overview.due, eventTime().localDate)) : 'off') : null;
  useEffect(() => {
    if (plan === null) return;
    if (plan === 'off') { void clearReminders().catch(() => undefined); return; }
    const items = JSON.parse(plan) as ReminderPlan[];
    void replaceReminders(items.map(item => ({ title: item.title, body: item.body, at: atReminderHour(item.localDate) }))).catch(() => undefined);
  }, [plan]);
  // Home-screen widgets follow the same data (due list and net worth).
  useEffect(() => {
    if (overview) void updateWidgets(overview).catch(() => undefined);
  }, [overview]);
}

export function ReminderToggle() {
  const { service, overview, refresh } = useTracker();
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const available = Platform.OS !== 'web';
  async function toggle(value: boolean) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setMessage(null);
    try {
      if (value && !await enableReminders()) { setMessage('Allow notifications for Owllowance in your phone settings, then try again.'); return; }
      await service.repository.saveSettings({ reminders: value });
      await refresh();
    } catch { setMessage('Could not change reminders. Try again.'); }
    finally { inFlight.current = false; }
  }
  return <>
    <ToggleRow label="Payment reminders" description={available ? `A notification at ${REMINDER_HOUR}:00 AM on days something is due. Names only, no amounts.` : 'Available in the Android app.'}
      value={overview?.settings.reminders ?? false} disabled={!available} onChange={value => { void toggle(value); }} />
    {message ? <Feedback error>{message}</Feedback> : null}
  </>;
}

// The bell: what's due, and the reminder switch.
export function RemindersModal({ onClose }: { onClose: () => void }) {
  return <AppModal title="Reminders" visible onClose={onClose}>
    <ReminderToggle />
    <PaymentsDue />
    <AppText size={12} tone="secondary">Reminders are created on this device only.</AppText>
    <Button label="Close" variant="quiet" onPress={onClose} />
  </AppModal>;
}
