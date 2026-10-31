<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Sidebar as TexuliSidebar } from 'texuli/sidebar';
import { isInDrawer } from '../app-shell/context.ts';
import type { SidebarItem, SidebarSection } from './types.ts';

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
  label?: string;
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
  label = 'Main',
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Inside the AppShell drawer copy (Texuli's DrawerScope) the sidebar is full width with no rail.
const drawer = isInDrawer();
</script>

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
  {label}
  class={className}
/>
