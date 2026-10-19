<script lang="ts" module>
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Building,
  Calendar,
  ChartColumn,
  ChartLine,
  ChartPie,
  CircleQuestionMark,
  Clock,
  Code,
  CreditCard,
  Database,
  FileText,
  Folder,
  FolderKanban,
  Globe,
  GraduationCap,
  Heart,
  House,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  Mail,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  Plug,
  Plus,
  Receipt,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  SquareCheckBig,
  SquareKanban,
  Star,
  Store,
  Tag,
  Truck,
  User,
  Users,
  Wallet,
  Workflow,
} from '@lucide/svelte';
import type { IconComponent } from '../lib/types.ts';
import type { NavIconName, NavIconRef } from './nav-model.ts';

/** Static name → component map: no dynamic import of the icon set. */
export const NAV_ICONS: Readonly<Record<NavIconName, IconComponent>> = {
  activity: Activity,
  archive: Archive,
  bell: Bell,
  'book-open': BookOpen,
  bot: Bot,
  briefcase: Briefcase,
  building: Building,
  calendar: Calendar,
  'chart-column': ChartColumn,
  'chart-line': ChartLine,
  'chart-pie': ChartPie,
  'check-square': SquareCheckBig,
  clock: Clock,
  code: Code,
  'credit-card': CreditCard,
  database: Database,
  'file-text': FileText,
  folder: Folder,
  'folder-kanban': FolderKanban,
  globe: Globe,
  'graduation-cap': GraduationCap,
  heart: Heart,
  help: CircleQuestionMark,
  home: House,
  inbox: Inbox,
  kanban: SquareKanban,
  key: KeyRound,
  layers: Layers,
  'layout-dashboard': LayoutDashboard,
  'life-buoy': LifeBuoy,
  'list-todo': ListTodo,
  mail: Mail,
  map: MapIcon,
  'map-pin': MapPin,
  megaphone: Megaphone,
  'message-square': MessageSquare,
  package: Package,
  plug: Plug,
  plus: Plus,
  receipt: Receipt,
  search: Search,
  settings: Settings,
  shield: Shield,
  'shopping-cart': ShoppingCart,
  sparkles: Sparkles,
  star: Star,
  store: Store,
  tag: Tag,
  truck: Truck,
  user: User,
  users: Users,
  wallet: Wallet,
  workflow: Workflow,
};

/** The component for an icon reference; `undefined` for an unknown name. */
export function navIconComponent(icon: NavIconRef | undefined): IconComponent | undefined {
  if (icon === undefined) return undefined;
  if (typeof icon === 'string') return Object.hasOwn(NAV_ICONS, icon) ? NAV_ICONS[icon] : undefined;
  return icon;
}
</script>

<script lang="ts">
interface Props {
  icon?: NavIconRef;
  class?: string;
}

let { icon, class: className }: Props = $props();
const Icon = $derived(navIconComponent(icon));
</script>

{#if Icon}
  <Icon class={className} aria-hidden="true" />
{/if}
