<script lang="ts">
import { type BottomNavItem, BottomNav as TexuliBottomNav } from 'texuli/layouts/mobile';
import type { NavItem } from '../../lib/types.ts';

interface Props {
  items: NavItem[];
  label?: string;
  /** Pin to the viewport bottom (default). Disable when placing it inside a custom frame. */
  fixed?: boolean;
  class?: string;
}

let { items, label = 'Primary', fixed = true, class: className }: Props = $props();

// Protoyard's NavItem (`active`) on Texuli's BottomNavItem (`current`); the key stays href + label.
const tabs = $derived<BottomNavItem[]>(
  items.map((item) => ({
    id: item.href + item.label,
    href: item.href,
    label: item.label,
    icon: item.icon,
    badge: item.badge,
    current: item.active ? 'page' : undefined,
  }))
);
</script>

<!-- `data-py-bottom-nav` lets DevTools and the shell tests find a pinned tab bar. -->
<TexuliBottomNav items={tabs} {label} {fixed} class={className} data-py-bottom-nav="" />
