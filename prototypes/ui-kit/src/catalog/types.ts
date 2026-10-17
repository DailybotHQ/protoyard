import type { Component } from 'svelte';

/** Live demo + copyable usage for one catalog entry. */
export interface CatalogDemo {
  /** Lazy loader for the demo component (code-split per demo). */
  // biome-ignore lint/suspicious/noExplicitAny: demos take no props.
  load: () => Promise<Component<any>>;
  /** Short, copy-pasteable usage (Svelte 5 runes syntax). */
  snippet: string;
  /** Accessibility notes shown under the demo. */
  a11y?: readonly string[];
}
