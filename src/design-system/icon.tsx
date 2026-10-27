import {
  CalendarDays, Flame, Target, ChartPie, CreditCard, ArrowLeftRight, House, List, Plus, ArrowLeft, ArrowDownLeft, Wallet, Utensils, Bus,
  ShoppingBag, Receipt, HeartPulse, CircleEllipsis, Check, ArrowUpRight, ShieldCheck, Bell, Settings, Gift, Briefcase, HandCoins, Pencil, EllipsisVertical, Archive, ArchiveRestore,
  BadgePercent, Coffee, GraduationCap, Smartphone, Clapperboard, Plane, PawPrint, Users, Sparkles, PiggyBank, Trash2, Copy, Search,
  SlidersHorizontal, ChartColumn, Download, Upload, Undo2, EyeOff, ChevronLeft, ChevronRight, X, Tags,
} from 'lucide-react-native';
import { useTheme } from './theme';

const icons = {
  edit: Pencil, more: EllipsisVertical, archive: Archive, restore: ArchiveRestore,
  fees: BadgePercent, coffee: Coffee, education: GraduationCap, phone: Smartphone, entertainment: Clapperboard, travel: Plane,
  pets: PawPrint, family: Users, beauty: Sparkles, savings: PiggyBank, delete: Trash2, duplicate: Copy, search: Search,
  filter: SlidersHorizontal, insights: ChartColumn, download: Download, upload: Upload, undo: Undo2, hidden: EyeOff,
  previous: ChevronLeft, next: ChevronRight, close: X, categories: Tags,
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
