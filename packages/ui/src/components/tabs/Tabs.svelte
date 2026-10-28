<script lang="ts">
import { Tabs as TabsPrimitive } from '@texuli/primitives/tabs';
import type { ComponentProps, Snippet } from 'svelte';
import { Icon } from 'texuli/icons';
import { tabsListClass, tabsRootClass, tabsTriggerClass } from 'texuli/tabs-accordion';
import { refAttachment } from '../../lib/ref.ts';
import type { TabItem } from './types.ts';

type Props = Omit<ComponentProps<typeof TabsPrimitive.Root>, 'children'> & {
  ref?: HTMLDivElement | null;
  items: TabItem[];
  /** Renders the panel for the given tab. */
  content?: Snippet<[TabItem]>;
  variant?: 'segmented' | 'underline';
  listClass?: string;
  /** Accessible name for the tab list. */
  label?: string;
};

let {
  items,
  value = $bindable(),
  content,
  variant = 'segmented',
  class: className,
  listClass,
  label,
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
</script>

<!--
  A thin adapter over Texuli's tabs: the primitive with the classes of `Tabs`
  from `texuli/tabs-accordion`, plus what that component cannot take yet: tab
  icons, `bind:ref` and rest attributes (Texuli gap G5).
-->
<TabsPrimitive.Root
  bind:value={() => value ?? '', (next) => (value = next)}
  {@attach refAttachment<HTMLDivElement>((node) => (ref = node))}
  {loop}
  class={tabsRootClass({ orientation: 'horizontal', variant: texuliVariant, class: className })}
  data-tx-tabs=""
  data-variant={texuliVariant}
  {...rest}
>
  <div class="tx-tabs__scroller">
    <TabsPrimitive.List
      aria-label={label}
      class={tabsListClass({ variant: texuliVariant, class: listClass })}
      data-tx-tabs-list=""
    >
      {#each items as item (item.value)}
        <TabsPrimitive.Trigger
          value={item.value}
          disabled={item.disabled}
          class={tabsTriggerClass({ variant: texuliVariant })}
          data-tx-tabs-trigger=""
        >
          {#if item.icon}<Icon icon={item.icon} size="sm" aria-hidden="true" />{/if}
          {item.label}
          {#if item.badge !== undefined}
            <span class="tx-tabs__badge">{item.badge}</span>
          {/if}
        </TabsPrimitive.Trigger>
      {/each}
    </TabsPrimitive.List>
  </div>
  {#if content}
    {#each items as item (item.value)}
      <TabsPrimitive.Content value={item.value} forceMount={false} class="tx-tabs__panel" data-tx-tabs-panel="">
        {@render content(item)}
      </TabsPrimitive.Content>
    {/each}
  {/if}
</TabsPrimitive.Root>
