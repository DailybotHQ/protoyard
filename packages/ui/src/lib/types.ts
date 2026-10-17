import type { LucideProps } from '@lucide/svelte';
import type { Component, Snippet } from 'svelte';

/** Any Lucide icon component (or a component that accepts the same props). */
export type IconComponent = Component<LucideProps>;

/** Adds a bindable `ref` to the underlying DOM element. */
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & { ref?: E | null };

/** Props a trigger snippet must spread onto its interactive element (Bits UI `child` pattern). */
export type TriggerSnippet = Snippet<[{ props: Record<string, unknown> }]>;

/** A navigation entry rendered as a plain `<a href>` (prototypes use hash routing). */
export interface NavItem {
  label: string;
  href: string;
  icon?: IconComponent;
  badge?: string | number;
  active?: boolean;
}
