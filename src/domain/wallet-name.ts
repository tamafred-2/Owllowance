import { ValidationError } from './money';

export function walletNameKey(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function validateWalletName(input: string, wallets: { id: string; name: string }[], excludingId?: string) {
  const name = input.trim();
  if (!name || name.length > 60) throw new ValidationError('Use a wallet name between 1 and 60 characters.');
  if (wallets.some(wallet => wallet.id !== excludingId && walletNameKey(wallet.name) === walletNameKey(name))) {
    throw new ValidationError('A wallet with this name already exists. Choose a different name.');
  }
  return name;
}
