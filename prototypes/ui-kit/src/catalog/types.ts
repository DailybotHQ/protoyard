import type { Component } from 'svelte';

/** Live demo + copyable usage for one catalog entry. */
export interface CatalogDemo {
  // biome-ignore lint/suspicious/noExplicitAny: demos take no props.
  component: Component<any>;
  /** Short, copy-pasteable usage (Svelte 5 runes syntax). */
  snippet: string;
  /** Accessibility notes shown under the demo. */
  a11y?: readonly string[];
}
