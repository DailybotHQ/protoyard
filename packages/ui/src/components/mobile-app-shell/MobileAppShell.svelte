<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { MobileAppFrame } from 'texuli/layouts/mobile';
import { cn } from '../../lib/cn.ts';

interface OwnProps {
  /** Usually a `<MobileHeader>`; remains outside the scroll region. */
  header?: Snippet;
  /** Bottom navigation rendered in normal flow; use `<BottomNav fixed={false}>`. */
  bottomNav?: Snippet;
  /** Screen-level action area between the scroll region and bottom navigation. */
  stickyFooter?: Snippet;
  children: Snippet;
  class?: string;
  mainClass?: string;
  mainId?: string;
  /** Text of the skip link (keyboard users jump past the header); translate it with the app. */
  skipLabel?: string;
  /** The frame's root element (bindable). */
  ref?: HTMLElement | null;
}

/** Extra attributes (`data-*`, `id`, handlers) land on the frame's root (Texuli's contract). */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'children'>;

let {
  header,
  bottomNav,
  stickyFooter,
  children,
  class: className,
  mainClass,
  mainId = 'mobile-app-content',
  skipLabel = 'Skip to content',
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<!--
  The caller's footer renders as is: Texuli's stickyFooter strip, unstyled (G95), so a caller
  that draws its own strip (mobile-banking-demo) is not wrapped in a second padded border. It
  sits between the scroll region and the navigation and hides while it renders nothing.
-->
<!--
  Texuli's frame fills --tx-app-height (the renderer maps it to --py-app-height) from
  @layer tx.components, below Tailwind's utilities, so a caller's height class (h-[640px]) wins.
-->
<MobileAppFrame
  {header}
  {bottomNav}
  {stickyFooter}
  stickyFooterUnstyled
  {children}
  {mainId}
  {skipLabel}
  class={cn('ui-mobile-app-shell', className)}
  {mainClass}
  {...rest}
  bind:ref
/>
