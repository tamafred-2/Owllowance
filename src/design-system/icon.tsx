import {
  CalendarDays, Flame, Target, ChartPie, CreditCard, ArrowLeftRight, House, List, Plus, ArrowLeft, ArrowDownLeft, Wallet, Utensils, Bus,
  ShoppingBag, Receipt, HeartPulse, CircleEllipsis, Check, ArrowUpRight, ShieldCheck, Bell, Settings, Gift, Briefcase, HandCoins, Pencil, EllipsisVertical, Archive, ArchiveRestore,
} from 'lucide-react-native';
import { useTheme } from './theme';

const icons = {
  edit: Pencil, more: EllipsisVertical, archive: Archive, restore: ArchiveRestore,
  plan: CalendarDays, streak: Flame, goals: Target, budgets: ChartPie, debt: CreditCard, transfer: ArrowLeftRight, home: House, activity: List, add: Plus, back: ArrowLeft, expense: ArrowUpRight,
  opening: ArrowDownLeft, wallet: Wallet, food: Utensils, transport: Bus, shopping: ShoppingBag,
  bills: Receipt, health: HeartPulse, other: CircleEllipsis, check: Check, local: ShieldCheck,
  notifications: Bell, settings: Settings, income: ArrowDownLeft, allowance: HandCoins, salary: Briefcase, work: Briefcase, gift: Gift,
};
export type IconName = keyof typeof icons;
export function AppIcon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  const Icon = icons[name] ?? icons.other;
  return <Icon size={size} color={color ?? colors.textSecondary} strokeWidth={1.8} accessible={false} aria-hidden />;
}
