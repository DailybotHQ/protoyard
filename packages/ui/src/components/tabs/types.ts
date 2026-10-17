import type { IconComponent } from '../../lib/types.ts';

export interface TabItem {
  value: string;
  label: string;
  icon?: IconComponent;
  badge?: string | number;
  disabled?: boolean;
}
