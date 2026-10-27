import type { Wallet, WalletKind } from '../domain/ledger';

export function nextWalletName(base: string, wallets: Wallet[]) {
  const names = new Set(wallets.map(wallet => wallet.name.trim().toLowerCase()));
  let name = base;
  let index = 2;
  while (names.has(name.toLowerCase())) name = `${base} ${index++}`;
  return name;
}

export function walletLabel(wallet: Wallet, wallets: Wallet[]) {
  const duplicates = wallets.filter(item => item.name.trim().toLowerCase() === wallet.name.trim().toLowerCase());
  if (duplicates.length < 2) return wallet.name;
  // Extend the stable suffix if necessary; never show identical labels for duplicates.
  let length = 4;
  while (length < wallet.id.length && duplicates.some(item => item.id !== wallet.id && item.id.slice(-length) === wallet.id.slice(-length))) length++;
  return `${wallet.name} (${wallet.id.slice(-length).toUpperCase()})`;
}

// Cosmetic name presets only (colors and letters; no third-party logos). Never used to calculate balances or identify accounts.
export const walletPresets: { name: string; kind: WalletKind; color: string; ink: string; badge: string }[] = [
  { name: 'GCash', kind: 'ewallet', color: '#125AC8', ink: '#FFFFFF', badge: 'G' },
  { name: 'Maya', kind: 'ewallet', color: '#075C3D', ink: '#FFFFFF', badge: 'Ma' },
  { name: 'BPI', kind: 'bank', color: '#A52336', ink: '#FFFFFF', badge: 'BPI' },
  { name: 'MariBank', kind: 'bank', color: '#FFBD80', ink: '#42260F', badge: 'M' },
  { name: 'BDO', kind: 'bank', color: '#124879', ink: '#FFFFFF', badge: 'BDO' },
  { name: 'UnionBank', kind: 'bank', color: '#9C400C', ink: '#FFFFFF', badge: 'UB' },
  { name: 'GoTyme', kind: 'bank', color: '#FFFFFF', ink: '#243B19', badge: 'Go' },
  { name: 'Metrobank', kind: 'bank', color: '#173F87', ink: '#FFFFFF', badge: 'MB' },
  { name: 'Wise', kind: 'ewallet', color: '#C3E78B', ink: '#243B19', badge: 'W' },
  { name: 'PayPal', kind: 'ewallet', color: '#193B75', ink: '#FFFFFF', badge: 'PP' },
];
export function walletAppearance(name: string, kind: WalletKind) {
  const normalized = name.trim().toLowerCase();
  // Branding stays recognizable even for older wallets saved under a different type.
  const preset = walletPresets.find(item => normalized === item.name.toLowerCase() || normalized.startsWith(`${item.name.toLowerCase()} `));
  return preset ?? { color: kind === 'cash' ? '#425F52' : kind === 'bank' ? '#24476B' : '#51486A', ink: '#FFFFFF', badge: '', name: '', kind };
}
