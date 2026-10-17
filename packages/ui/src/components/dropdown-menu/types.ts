import type { IconComponent } from '../../lib/types.ts';

export interface DropdownMenuAction {
  type?: 'item';
  label: string;
  icon?: IconComponent;
  /** Keyboard hint shown on the right, e.g. "⌘K". Display only. */
  shortcut?: string;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuSeparator {
  type: 'separator';
}

export interface DropdownMenuHeading {
  type: 'label';
  label: string;
}

export type DropdownMenuEntry = DropdownMenuAction | DropdownMenuSeparator | DropdownMenuHeading;
