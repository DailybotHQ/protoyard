<script lang="ts">
import { PanelLeftClose, PanelLeftOpen } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { anchorProps } from '../../lib/props.ts';
import { isInDrawer } from '../app-shell/context.ts';
import Tooltip from '../tooltip/Tooltip.svelte';
import type { SidebarItem, SidebarSection } from './types.ts';

interface Props {
  /** Flat item list; use `sections` for grouped navigation. */
  items?: SidebarItem[];
  sections?: SidebarSection[];
  /** Icons-only mode (desktop). Ignored inside the AppShell mobile drawer. */
  collapsed?: boolean;
  collapsible?: boolean;
  /** Brand/workspace area; receives the effective collapsed state. */
  header?: Snippet<[{ collapsed: boolean }]>;
  footer?: Snippet<[{ collapsed: boolean }]>;
  label?: string;
  class?: string;
}

let {
  items,
  sections,
  collapsed = $bindable(false),
  collapsible = true,
  header,
  footer,
  label = 'Main',
  class: className,
}: Props = $props();

const inDrawer = isInDrawer();
const isCollapsed = $derived(collapsed && !inDrawer);
const groups: SidebarSection[] = $derived(sections ?? (items ? [{ items }] : []));

const linkBase = cn(
  'group relative flex h-9 min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium lg:min-h-0',
  'text-sidebar-foreground/80 transition-colors hover:bg-foreground/5 hover:text-sidebar-foreground',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  // Active: tinted fill + primary icon; the label keeps sidebar text color, since
  // primary text on a primary tint can drop below 4.5:1 in some themes.
  'aria-[current=page]:bg-primary/10 aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-foreground aria-[current=page]:[&_svg]:text-primary',
  '[&_svg]:size-4 [&_svg]:shrink-0'
);
</script>

{#snippet badge(item: SidebarItem)}
  {#if item.badge !== undefined}
    {#if isCollapsed}
      <span class="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden="true"></span>
      <span class="sr-only">({item.badge})</span>
    {:else}
      <span
        class="ml-auto rounded-full bg-foreground/10 px-1.5 py-px text-xs font-medium text-sidebar-foreground tabular-nums"
      >
        {item.badge}
      </span>
    {/if}
  {/if}
{/snippet}

<nav
  aria-label={label}
  data-collapsed={isCollapsed || undefined}
  class={cn(
    'flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
    inDrawer ? 'w-full' : 'border-r border-sidebar-border',
    !inDrawer && (isCollapsed ? 'w-16' : 'w-64'),
    className
  )}
>
  {#if header}
    <div class={cn('flex min-h-14 shrink-0 items-center px-3', inDrawer && 'pr-14')}>
      {@render header({ collapsed: isCollapsed })}
    </div>
  {/if}

  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
    {#each groups as group, groupIndex (groupIndex)}
      <div class="grid gap-0.5">
        {#if group.label}
          {#if isCollapsed}
            {#if groupIndex > 0}<div class="mx-2 mb-1 h-px bg-sidebar-border" aria-hidden="true"></div>{/if}
          {:else}
            <p class="px-3 pt-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
          {/if}
        {/if}
        <ul class="grid gap-0.5">
          {#each group.items as item (item.href + item.label)}
            <li>
              {#if isCollapsed}
                <Tooltip content={item.label} side="right">
                  {#snippet children({ props })}
                    <a
                      {...anchorProps(props)}
                      href={item.href}
                      aria-current={item.active ? 'page' : undefined}
                      class={cn(linkBase, 'justify-center px-0')}
                    >
                      {#if item.icon}
                        <item.icon aria-hidden="true" />
                      {:else}
                        <span aria-hidden="true" class="text-xs font-semibold">{item.label.slice(0, 2)}</span>
                      {/if}
                      <span class="sr-only">{item.label}</span>
                      {@render badge(item)}
                    </a>
                  {/snippet}
                </Tooltip>
              {:else}
                <a href={item.href} aria-current={item.active ? 'page' : undefined} class={linkBase}>
                  {#if item.icon}<item.icon aria-hidden="true" />{/if}
                  <span class="truncate">{item.label}</span>
                  {@render badge(item)}
                </a>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  {#if footer || (collapsible && !inDrawer)}
    <div class="flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-2">
      {@render footer?.({ collapsed: isCollapsed })}
      {#if collapsible && !inDrawer}
        <button
          type="button"
          class={cn(linkBase, isCollapsed && 'justify-center px-0')}
          aria-expanded={!isCollapsed}
          onclick={() => (collapsed = !collapsed)}
        >
          {#if isCollapsed}
            <PanelLeftOpen aria-hidden="true" />
            <span class="sr-only">Expand sidebar</span>
          {:else}
            <PanelLeftClose aria-hidden="true" />
            <span>Collapse</span>
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</nav>
