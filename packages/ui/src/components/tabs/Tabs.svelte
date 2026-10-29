<script lang="ts">
import type { ComponentProps, Snippet } from 'svelte';
import { Tabs as TexuliTabs } from 'texuli/tabs-accordion';
import type { TabItem } from './types.ts';

type Props = Omit<
  ComponentProps<typeof TexuliTabs>,
  'items' | 'content' | 'variant' | 'ref' | 'class'
> & {
  ref?: HTMLDivElement | null;
  items: TabItem[];
  /** Renders the panel for the given tab. */
  content?: Snippet<[TabItem]>;
  variant?: 'segmented' | 'underline';
  class?: string;
  listClass?: string;
  /** Accessible name for the tab list. */
  label?: string;
};

let {
  items,
  value = $bindable(),
  content,
  variant = 'segmented',
  ref = $bindable(null),
  // Arrow keys wrap from the last tab to the first.
  loop = true,
  ...rest
}: Props = $props();

$effect.pre(() => {
  if (value === undefined || value === '') value = items.find((item) => !item.disabled)?.value;
});

// Protoyard's two looks map onto Texuli's: the segmented control is `pills`, underline is `line`.
const texuliVariant = $derived(variant === 'underline' ? 'line' : 'pills');
// Texuli hands each panel the item it was given, so the snippet sees this package's TabItem.
const panel = $derived(content as unknown as ComponentProps<typeof TexuliTabs>['content']);
// A plain record keeps the spread onto Texuli's Tabs a finite type.
const forwarded = $derived(rest as Record<string, unknown>);
</script>

<!-- Texuli's `Tabs` (`texuli/tabs-accordion`), with Protoyard's variant names. -->
<TexuliTabs
  bind:ref={() => ref, (node) => (ref = node as HTMLDivElement | null)}
  bind:value={() => value ?? '', (next) => (value = next)}
  {items}
  content={panel}
  {loop}
  variant={texuliVariant}
  {...forwarded}
/>
