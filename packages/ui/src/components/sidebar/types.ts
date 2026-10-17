import type { NavItem } from '../../lib/types.ts';

export type SidebarItem = NavItem;

export interface SidebarSection {
  /** Optional heading; hidden when the sidebar is collapsed. */
  label?: string;
  items: SidebarItem[];
}
