import {
  ArrowLeftRight,
  Briefcase,
  Bus,
  Clapperboard,
  CreditCard,
  HeartPulse,
  House,
  PiggyBank,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  Wallet,
  Zap,
} from '@lucide/svelte';
import type { IconComponent } from '@protoyard/ui';
import type { AccountType, Category } from '../database/schema.ts';

export const CATEGORY_ICONS: Record<Category, IconComponent> = {
  groceries: ShoppingBasket,
  dining: Utensils,
  transport: Bus,
  shopping: ShoppingBag,
  utilities: Zap,
  rent: House,
  salary: Briefcase,
  transfer: ArrowLeftRight,
  entertainment: Clapperboard,
  health: HeartPulse,
};

export const ACCOUNT_ICONS: Record<AccountType, IconComponent> = {
  checking: Wallet,
  savings: PiggyBank,
  credit: CreditCard,
};
