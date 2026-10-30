<script lang="ts">
import * as MenuPrimitive from '@texuli/primitives/menu';
import type { HTMLAttributes } from 'svelte/elements';
import { Icon } from 'texuli/icons';
import { MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator } from 'texuli/menus';
import type { TriggerSnippet } from '../../lib/types.ts';
import type { DropdownMenuAction, DropdownMenuEntry, DropdownMenuSeparator } from './types.ts';

interface OwnProps {
  /** The menu content element (bindable). */
  ref?: HTMLElement | null;
  items: DropdownMenuEntry[];
  /** Spread `props` onto the trigger: `{#snippet trigger({ props })}<Button {...props}>…` */
  trigger: TriggerSnippet;
  open?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  class?: string;
}

/** Extra attributes (`data-*`, `aria-*`, `id`, handlers…) land on the menu content element. */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

let {
  items,
  trigger,
  open = $bindable(false),
  side = 'bottom',
  align = 'end',
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

interface Section {
  heading?: string;
  entries: (DropdownMenuAction | DropdownMenuSeparator)[];
}

// A heading names its group (aria-labelledby), so each `label` entry starts a labelled group.
const sections = $derived.by(() => {
  const result: Section[] = [{ entries: [] }];
  for (const entry of items) {
    if (entry.type === 'label') result.push({ heading: entry.label, entries: [] });
    else result[result.length - 1]?.entries.push(entry);
  }
  return result.filter((section) => section.heading !== undefined || section.entries.length > 0);
});
</script>

<!--
  A thin adapter: Texuli's styled menu parts (`texuli/menus`), driven by an
  `items` list. The trigger stays the caller's own element, so the root is the
  primitive. A destructive entry takes MenuItem's own danger tone.
-->
{#snippet entryList(entries: Section['entries'])}
  {#each entries as entry, index (index)}
    {#if entry.type === 'separator'}
      <MenuSeparator />
    {:else}
      {#snippet entryIcon()}
        {#if entry.icon}<Icon icon={entry.icon} size="sm" aria-hidden="true" />{/if}
      {/snippet}
      <MenuItem
        disabled={entry.disabled}
        textValue={entry.label}
        onSelect={() => entry.onSelect?.()}
        shortcut={entry.shortcut}
        icon={entry.icon ? entryIcon : undefined}
        destructive={entry.destructive}
      >
        {entry.label}
      </MenuItem>
    {/if}
  {/each}
{/snippet}

<MenuPrimitive.Root bind:open>
  <MenuPrimitive.Trigger>
    {#snippet child({ props })}{@render trigger({ props })}{/snippet}
  </MenuPrimitive.Trigger>
  <!-- The content shows in the top layer; no portal is needed. -->
  <MenuContent {...rest} bind:ref {side} {align} sideOffset={4} class={className}>
    {#each sections as section, index (index)}
      {#if section.heading !== undefined}
        <MenuGroup>
          <MenuLabel>{section.heading}</MenuLabel>
          {@render entryList(section.entries)}
        </MenuGroup>
      {:else}
        {@render entryList(section.entries)}
      {/if}
    {/each}
  </MenuContent>
</MenuPrimitive.Root>

