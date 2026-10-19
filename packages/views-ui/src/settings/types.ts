import type { IconComponent } from '@protoyard/ui';

export interface SettingsNavItem {
  id: string;
  label: string;
  /** Shown under the label in the phone list. */
  description?: string;
  icon?: IconComponent;
}

/** Field errors by field name, as `runService` returns them for validation failures. */
export type FieldErrors = Record<string, string>;
