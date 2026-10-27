import { Feedback } from '../../../design-system/primitives';

const messages: Record<string, string> = {
  expense: 'Expense saved.', income: 'Income saved.', transfer: 'Transfer saved.', updated: 'Changes saved.', deleted: 'Transaction deleted.',
};

export function SavedFeedback({ saved }: { saved?: string }) {
  return saved && messages[saved] ? <Feedback>{messages[saved]}</Feedback> : null;
}
