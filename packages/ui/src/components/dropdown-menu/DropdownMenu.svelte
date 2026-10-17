<script lang="ts">
import { DropdownMenu as MenuPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';
import { floatingItem, floatingSurface } from '../../lib/overlay.ts';
import type { TriggerSnippet } from '../../lib/types.ts';
import type { DropdownMenuAction, DropdownMenuEntry, DropdownMenuSeparator } from './types.ts';

interface Props {
  items: DropdownMenuEntry[];
  /** Spread `props` onto the trigger: `{#snippet trigger({ props })}<Button {...props}>…` */
  trigger: TriggerSnippet;
  open?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  class?: string;
}

let {
  items,
  trigger,
  open = $bindable(false),
  side = 'bottom',
  align = 'end',
  class: className,
}: Props = $props();

interface Section {
  heading?: string;
  entries: (DropdownMenuAction | DropdownMenuSeparator)[];
}

// Bits requires headings inside a Group, so each `label` entry starts a labelled group.
const sections = $derived.by(() => {
  const result: Section[] = [{ entries: [] }];
  for (const entry of items) {
    if (entry.type === 'label') result.push({ heading: entry.label, entries: [] });
    else result[result.length - 1]?.entries.push(entry);
  }
  return result.filter((section) => section.heading !== undefined || section.entries.length > 0);
});
</script>

{#snippet entryList(entries: Section['entries'])}
  {#each entries as entry, index (index)}
    {#if entry.type === 'separator'}
      <MenuPrimitive.Separator class="-mx-1 my-1 h-px bg-border" />
    {:else}
      <MenuPrimitive.Item
        disabled={entry.disabled}
        textValue={entry.label}
        onSelect={() => entry.onSelect?.()}
        class={cn(
          floatingItem,
          entry.destructive &&
            'text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive'
        )}
      >
        {#if entry.icon}
          <entry.icon aria-hidden="true" />
        {/if}
        <span class="flex-1 truncate">{entry.label}</span>
        {#if entry.shortcut}
          <span class="ml-4 text-xs tracking-wide text-muted-foreground">{entry.shortcut}</span>
        {/if}
      </MenuPrimitive.Item>
    {/if}
  {/each}
{/snippet}

<MenuPrimitive.Root bind:open>
  <MenuPrimitive.Trigger>
    {#snippet child({ props })}{@render trigger({ props })}{/snippet}
  </MenuPrimitive.Trigger>
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      {side}
      {align}
      sideOffset={4}
      class={cn(floatingSurface, 'min-w-44 p-1', className)}
    >
      {#each sections as section, index (index)}
        {#if section.heading !== undefined}
          <MenuPrimitive.Group>
            <MenuPrimitive.GroupHeading
              class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {section.heading}
            </MenuPrimitive.GroupHeading>
            {@render entryList(section.entries)}
          </MenuPrimitive.Group>
        {:else}
          {@render entryList(section.entries)}
        {/if}
      {/each}
    </MenuPrimitive.Content>
  </MenuPrimitive.Portal>
</MenuPrimitive.Root>
