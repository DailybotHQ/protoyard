<script lang="ts">
import type { ComponentProps, Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Icon, type IconRef } from 'texuli/icons';
import { Sidebar as TexuliSidebar } from 'texuli/sidebar';
import { isInDrawer } from '../app-shell/context.ts';
import { sidebarShortLabel } from './short-label.ts';
import type { SidebarItem, SidebarSection } from './types.ts';

type ItemIconSnippet = NonNullable<ComponentProps<typeof TexuliSidebar>['itemIcon']>;

type Props = Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> & {
  /** Flat item list; use `sections` for grouped navigation. */
  items?: SidebarItem[];
  sections?: SidebarSection[];
  /** Icons-only mode (desktop). Ignored inside the AppShell mobile drawer. */
  collapsed?: boolean;
  collapsible?: boolean;
  /** Brand/workspace area; receives the effective collapsed state. */
  header?: Snippet<[{ collapsed: boolean }]>;
  footer?: Snippet<[{ collapsed: boolean }]>;
  /**
   * Leading icon per item, given the item and the collapsed state. Defaults to
   * the item's `icon` (two letters when it has none).
   */
  itemIcon?: ItemIconSnippet;
  /** Landmark name. Default: Texuli's `texuli.sidebar.label` ("Main"). */
  label?: string;
  /** Collapse button name. Default: Texuli's `texuli.sidebar.collapse-label`. */
  collapseLabel?: string;
  /** Expand button name. Default: Texuli's `texuli.sidebar.expand-label`. */
  expandLabel?: string;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  items,
  sections,
  collapsed = $bindable(false),
  collapsible = true,
  header,
  footer,
  itemIcon,
  label,
  collapseLabel,
  expandLabel,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Inside the AppShell drawer copy (Texuli's DrawerScope) the sidebar is full width with no rail.
const drawer = isInDrawer();
</script>

<!-- The item's own icon (a Lucide component or a registered icon name), else two letters as in Texuli. -->
{#snippet defaultItemIcon(item: Parameters<ItemIconSnippet>[0])}
  {#if item.icon}
    <!-- A string is an icon name (built in or registered with Texuli's registerIcons). -->
    <Icon icon={item.icon as IconRef} size="sm" aria-hidden="true" data-py-sidebar-icon="" />
  {:else}
    {sidebarShortLabel(item)}
  {/if}
{/snippet}

<!-- A thin adapter: Texuli's styled Sidebar (`texuli/sidebar`), told when it sits in the AppShell drawer. -->
<TexuliSidebar
  {...rest}
  bind:ref
  {items}
  {sections}
  bind:collapsed
  {collapsible}
  {drawer}
  {header}
  {footer}
  itemIcon={itemIcon ?? defaultItemIcon}
  {label}
  {collapseLabel}
  {expandLabel}
  class={className}
/>
