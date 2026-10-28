<script lang="ts">
import type { Snippet } from 'svelte';
import { Sidebar as TexuliSidebar } from 'texuli/sidebar';
import { isInDrawer } from '../app-shell/context.ts';
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

// Inside the AppShell drawer copy (Texuli's DrawerScope) the sidebar is full width with no rail.
const drawer = isInDrawer();
</script>

<!-- A thin adapter: Texuli's styled Sidebar (`texuli/sidebar`), told when it sits in the AppShell drawer. -->
<TexuliSidebar
  {items}
  {sections}
  bind:collapsed
  {collapsible}
  {drawer}
  {header}
  {footer}
  {label}
  class={className}
/>
