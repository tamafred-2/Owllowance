// Supported bounds keep individual amounts and aggregate arithmetic exact.
export const MAX_MINOR = 9_000_000_000_000;
export type Currency = 'PHP';

export class ValidationError extends Error {}

export function assertMinor(value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_MINOR) {
    throw new ValidationError('Amount is outside the supported range.');
  }
  return value;
}

export function parseAmount(input: string, allowZero = false): number {
  const value = input.trim();
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(value)) {
    throw new ValidationError('Enter an amount with up to two decimal places, without commas.');
  }
  const [whole, fraction = ''] = value.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor > BigInt(MAX_MINOR)) throw new ValidationError('Amount is too large.');
  if (minor === 0n && !allowZero) throw new ValidationError('Amount must be greater than zero.');
  return Number(minor);
}

export function addMinor(left: number, right: number): number {
  return assertMinor(assertMinor(left) + assertMinor(right));
}

const formatter = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export function formatMoney(value: number): string {
  return formatter.format(assertMinor(value) / 100);
}
