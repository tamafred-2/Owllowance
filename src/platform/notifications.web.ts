// The web build has no background notifications; reminders are a phone feature.
export type Reminder = { title: string; body: string; at: Date };
export async function enableReminders(): Promise<boolean> { return false; }
export async function replaceReminders(_reminders: Reminder[]): Promise<void> {}
export async function clearReminders(): Promise<void> {}
