import { ValidationError } from './money';
import { walletNameKey } from './wallet-name';

// Semantic keys only; presentation maps them to icons and theme colors.
export const categoryIconKeys = [
  'food', 'transport', 'shopping', 'bills', 'health', 'other', 'fees', 'home', 'coffee', 'education', 'phone',
  'entertainment', 'travel', 'pets', 'family', 'beauty', 'savings', 'allowance', 'salary', 'work', 'gift', 'income',
] as const;
export const categoryColorTokens = ['accent', 'success', 'slate', 'teal', 'amber', 'rose', 'violet', 'orange'] as const;

export function validateCategoryName(input: string, existing: { id: string; name: string; type: string }[], type: string, excludingId?: string) {
  const name = input.trim();
  if (!name || name.length > 40) throw new ValidationError('Use a category name between 1 and 40 characters.');
  if (existing.some(item => item.id !== excludingId && item.type === type && walletNameKey(item.name) === walletNameKey(name))) {
    throw new ValidationError('A category with this name already exists.');
  }
  return name;
}
