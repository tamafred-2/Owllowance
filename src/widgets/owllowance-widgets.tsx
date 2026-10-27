import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { owlAddSvg } from '../components/owl-add-shape';

// Home-screen widgets. They show names, dates and (unless hidden) one balance; never per-item amounts.
type Palette = { background: `#${string}`; text: `#${string}`; muted: `#${string}`; accent: `#${string}`; error: `#${string}`; divider: `#${string}` };
const light: Palette = { background: '#FFFFFF', text: '#202733', muted: '#566273', accent: '#24476B', error: '#A12828', divider: '#E2E6EC' };
const dark: Palette = { background: '#222833', text: '#F3F5F7', muted: '#BAC3CF', accent: '#A4C6E8', error: '#FFAAAA', divider: '#3B4656' };

export type DueRow = { name: string; when: string; overdue: boolean };

function PaymentsDue({ rows, more, palette }: { rows: DueRow[]; more: number; palette: Palette }) {
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'owllowance:///' }} accessibilityLabel="Payments due. Open Owllowance"
    style={{ height: 'match_parent', width: 'match_parent', backgroundColor: palette.background, borderRadius: 20, padding: 14, flexDirection: 'column', flexGap: 6 }}>
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <TextWidget text="Payments due" style={{ fontSize: 15, fontWeight: '700', color: palette.text }} />
      <TextWidget text="Owllowance" style={{ fontSize: 11, color: palette.muted }} />
    </FlexWidget>
    {rows.length ? rows.map((row, index) => <FlexWidget key={`${row.name}-${index}`}
      style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderTopWidth: index ? 1 : 0, borderColor: palette.divider }}>
      <TextWidget text={row.name} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: '600', color: palette.text }} />
      <TextWidget text={row.when} style={{ fontSize: 12, color: row.overdue ? palette.error : palette.muted }} />
    </FlexWidget>) : <TextWidget text="Nothing due this week." style={{ fontSize: 13, color: palette.muted }} />}
    {more ? <TextWidget text={`+${more} more`} style={{ fontSize: 11, color: palette.muted }} /> : null}
  </FlexWidget>;
}

export function PaymentsDueWidget({ rows, more }: { rows: DueRow[]; more: number }) {
  return { light: <PaymentsDue rows={rows} more={more} palette={light} />, dark: <PaymentsDue rows={rows} more={more} palette={dark} /> };
}

function QuickAdd({ isDark }: { isDark: boolean }) {
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'owllowance:///expense?mode=expense' }} accessibilityLabel="Add expense"
    style={{ height: 'match_parent', width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}>
    <SvgWidget svg={owlAddSvg(isDark)} style={{ width: 64, height: 54 }} />
  </FlexWidget>;
}

export function QuickAddWidget() {
  return { light: <QuickAdd isDark={false} />, dark: <QuickAdd isDark /> };
}

function Balance({ amount, palette }: { amount: string; palette: Palette }) {
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'owllowance:///accounts' }} accessibilityLabel={`Net worth ${amount}. Open wallets`}
    style={{ height: 'match_parent', width: 'match_parent', backgroundColor: palette.background, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'column', justifyContent: 'center' }}>
    <TextWidget text="NET WORTH" style={{ fontSize: 10, fontWeight: '600', color: palette.muted, letterSpacing: 0.08 }} />
    <TextWidget text={amount} maxLines={1} style={{ fontSize: 20, fontWeight: '700', color: palette.text }} />
  </FlexWidget>;
}

export function BalanceWidget({ amount }: { amount: string }) {
  return { light: <Balance amount={amount} palette={light} />, dark: <Balance amount={amount} palette={dark} /> };
}
