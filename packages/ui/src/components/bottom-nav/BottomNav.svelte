<script lang="ts">
import type { Attachment } from 'svelte/attachments';
import type { HTMLAttributes } from 'svelte/elements';
import { type BottomNavItem, BottomNav as TexuliBottomNav } from 'texuli/layouts/mobile';
import type { NavItem } from '../../lib/types.ts';

type Props = Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> & {
  items: NavItem[];
  label?: string;
  /** Pin to the viewport bottom (default). Disable when placing it inside a custom frame. */
  fixed?: boolean;
  class?: string;
  /** The rendered `nav` (bindable). */
  ref?: HTMLElement | null;
};

let {
  items,
  label = 'Primary',
  fixed = true,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Texuli's BottomNav (0.8) spreads rest attributes on its `nav` but has no `ref`;
// an attachment travels with that spread and reports the element.
const captureRef: Attachment<HTMLElement> = (node) => {
  ref = node;
  return () => {
    if (ref === node) ref = null;
  };
};

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
<TexuliBottomNav
  {...rest}
  {@attach captureRef}
  items={tabs}
  {label}
  {fixed}
  class={className}
  data-py-bottom-nav=""
/>
