// How much to set aside per month to reach a goal by its date (whole months, at least one).
export function monthlyNeeded(savedMinor: number, targetMinor: number, targetDate: string | null, today: string): number | null {
  const remaining = targetMinor - savedMinor;
  if (!targetDate || remaining <= 0 || targetDate < today) return null;
  const [ty, tm] = targetDate.split('-').map(Number);
  const [y, m] = today.split('-').map(Number);
  const months = Math.max(1, (ty - y) * 12 + (tm - m) + (Number(targetDate.slice(8)) >= Number(today.slice(8)) ? 1 : 0));
  return Math.ceil(remaining / months);
}
