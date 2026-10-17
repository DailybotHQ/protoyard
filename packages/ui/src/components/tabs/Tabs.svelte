<script lang="ts">
import { Tabs as TabsPrimitive } from 'bits-ui';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import type { TabItem } from './types.ts';

type Props = Omit<TabsPrimitive.RootProps, 'children' | 'child'> & {
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
  ...rest
}: Props = $props();

$effect.pre(() => {
  if (value === undefined || value === '') value = items.find((item) => !item.disabled)?.value;
});
</script>

<TabsPrimitive.Root
  bind:value={() => value ?? '', (next) => (value = next)}
  bind:ref
  class={cn('flex flex-col gap-3', className)}
  {...rest}
>
  <div class="-mx-1 overflow-x-auto px-1 pb-0.5">
    <TabsPrimitive.List
      aria-label={label}
      class={cn(
        variant === 'segmented'
          ? 'inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground'
          : 'flex items-center gap-4 border-b border-border text-muted-foreground',
        listClass
      )}
    >
      {#each items as item (item.value)}
        <TabsPrimitive.Trigger
          value={item.value}
          disabled={item.disabled}
          class={cn(
            'inline-flex min-h-touch items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors outline-none sm:min-h-0',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
            variant === 'segmented'
              ? 'h-8 rounded-md px-3 hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-soft'
              : '-mb-px h-10 border-b-2 border-transparent px-1 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground'
          )}
        >
          {#if item.icon}<item.icon aria-hidden="true" />{/if}
          {item.label}
          {#if item.badge !== undefined}
            <span class="rounded-full bg-background px-1.5 text-xs tabular-nums text-muted-foreground">
              {item.badge}
            </span>
          {/if}
        </TabsPrimitive.Trigger>
      {/each}
    </TabsPrimitive.List>
  </div>
  {#if content}
    {#each items as item (item.value)}
      <TabsPrimitive.Content
        value={item.value}
        class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {@render content(item)}
      </TabsPrimitive.Content>
    {/each}
  {/if}
</TabsPrimitive.Root>
