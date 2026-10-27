import { Feedback } from '../../../design-system/primitives';

export const savedMessages: Record<string, string> = {
  expense: 'Expense saved.', income: 'Income saved.', transfer: 'Transfer saved.', updated: 'Changes saved.', deleted: 'Transaction deleted.', wallet: 'Wallet added.', goal: 'Goal saved.', debt: 'Debt saved.',
};

export function SavedFeedback({ saved }: { saved?: string }) {
  return saved && savedMessages[saved] ? <Feedback>{savedMessages[saved]}</Feedback> : null;
}
