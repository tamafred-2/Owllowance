import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type Reminder = { title: string; body: string; at: Date };
const CHANNEL = 'payment-reminders';

// Local-only notifications: nothing leaves the device.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function enableReminders(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Payment reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// Replaces every scheduled reminder with the given list (future times only).
export async function replaceReminders(reminders: Reminder[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  for (const reminder of reminders) {
    if (reminder.at.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL },
    });
  }
}

export async function clearReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
