import type { IconComponent } from '../../lib/types.ts';

export interface TabItem {
  value: string;
  label: string;
  icon?: IconComponent;
  /** A count or short tag after the label; it is part of the tab's accessible name. */
  badge?: string | number;
  /** The badge's words in the accessible name ("3 unread"); defaults to the badge itself. */
  badgeLabel?: string;
  disabled?: boolean;
}
