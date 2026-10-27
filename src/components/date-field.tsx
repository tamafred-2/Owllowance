import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, displayDate, eventTime, monthStart, nextMonthStart } from '../domain/date';
import { AppText, Button } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';
import { AppModal } from './app-modal';

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const monthLabel = (localDate: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${localDate}T12:00:00Z`));

// Calendar picker on YYYY-MM-DD strings; `max` (inclusive) blocks later days.
// `compact` renders a small chip (for headers) instead of a labelled field.
export function DateField({ label, value, onChange, max, disabled = false, compact = false }: { label: string; value: string; onChange: (value: string) => void; max?: string; disabled?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthStart(value));
  const today = eventTime().localDate;
  const leading = (new Date(`${month}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days: string[] = [];
  for (let day = month; day < nextMonthStart(month); day = addDays(day, 1)) days.push(day);
  const caption = value === today ? `Today, ${displayDate(value)}` : value === addDays(today, -1) ? `Yesterday, ${displayDate(value)}` : displayDate(value);
  const short = value === today ? 'Today' : value === addDays(today, -1) ? 'Yesterday' : displayDate(value);
  const openPicker = () => { setMonth(monthStart(value)); setOpen(true); };
  return <View style={{ gap: 8 }}>
    {compact ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${caption}`} disabled={disabled} onPress={openPicker} hitSlop={6}
      style={({ pressed }) => ({ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12,
        borderColor: colors.border, backgroundColor: colors.surface, opacity: disabled ? 0.55 : pressed ? 0.8 : 1 })}>
      <AppIcon name="plan" size={14} color={colors.accent} /><AppText size={13} weight="500">{short}</AppText>
    </Pressable> : <>
      <AppText size={14} weight="500">{label}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${caption}`} disabled={disabled} onPress={openPicker}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, borderColor: colors.border, backgroundColor: colors.surface, opacity: disabled ? 0.55 : 1 }}>
        <AppIcon name="plan" size={18} color={colors.accent} /><AppText size={16}>{caption}</AppText>
      </Pressable>
    </>}
    <AppModal title={label} visible={open} onClose={() => setOpen(false)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Previous month" icon="previous" iconOnly variant="quiet" onPress={() => setMonth(monthStart(addDays(month, -1)))} />
        <AppText weight="600">{monthLabel(month)}</AppText>
        <Button label="Next month" icon="next" iconOnly variant="quiet" disabled={Boolean(max && nextMonthStart(month) > max)} onPress={() => setMonth(nextMonthStart(month))} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {weekdays.map(day => <View key={day} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}><AppText size={12} tone="secondary">{day}</AppText></View>)}
        {Array.from({ length: leading }, (_, index) => <View key={`blank-${index}`} style={{ width: `${100 / 7}%` }} />)}
        {days.map(day => {
          const blocked = Boolean(max && day > max);
          const selected = day === value;
          return <View key={day} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={displayDate(day)} accessibilityState={{ selected, disabled: blocked }} disabled={blocked}
              onPress={() => { onChange(day); setOpen(false); }}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.accent : 'transparent',
                borderWidth: day === today && !selected ? 1 : 0, borderColor: colors.accent, opacity: blocked ? 0.3 : 1 }}>
              <AppText size={14} weight={selected ? '700' : '400'} style={{ color: selected ? colors.onAccent : colors.textPrimary }}>{Number(day.slice(8))}</AppText>
            </Pressable>
          </View>;
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(!max || today <= max) ? <View style={{ flex: 1 }}><Button label="Today" variant="secondary" onPress={() => { onChange(today); setOpen(false); }} /></View> : null}
        <View style={{ flex: 1 }}><Button label="Close" variant="quiet" onPress={() => setOpen(false)} /></View>
      </View>
    </AppModal>
  </View>;
}
