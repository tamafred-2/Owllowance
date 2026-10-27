import { router } from 'expo-router';

// Where an entry form was opened from, so saving or going back returns there.
export type Origin = 'home' | 'wallet' | 'manage' | 'history';

export function originOf(from: string | undefined, walletId: string | undefined): Origin {
  if (from === 'manage' && walletId) return 'manage';
  return from === 'wallet' || from === 'history' ? from : 'home';
}

export function leaveTo(origin: Origin, walletId: string, saved?: string): void {
  const extra = saved ? { saved } : {};
  if (origin === 'manage') router.replace({ pathname: '/wallet-manage', params: { id: walletId, ...extra } });
  else router.replace({ pathname: origin === 'wallet' ? '/accounts' : origin === 'history' ? '/activity' : '/', params: extra });
}
