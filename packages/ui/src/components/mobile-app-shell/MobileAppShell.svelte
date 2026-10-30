<script lang="ts">
import type { Snippet } from 'svelte';
import { MobileAppFrame } from 'texuli/layouts/mobile';
import { cn } from '../../lib/cn.ts';

interface Props {
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
}

let {
  header,
  bottomNav,
  stickyFooter,
  children,
  class: className,
  mainClass,
  mainId = 'mobile-app-content',
  skipLabel = 'Skip to content',
}: Props = $props();
</script>

<!--
  The caller's footer renders as is, between the scroll region and the navigation, so it goes
  in the frame's bottom slot. Texuli's own stickyFooter (0.8) hides itself when the snippet
  renders nothing, but still wraps a footer in its padded, bordered strip; callers style
  their own strip (mobile-banking-demo), which would then show doubled (Texuli gap G95).
-->
{#snippet bottom()}
  {@render stickyFooter?.()}
  {@render bottomNav?.()}
{/snippet}

<!--
  Texuli's frame fills --tx-app-height (the renderer maps it to --py-app-height) from
  @layer tx.components, below Tailwind's utilities, so a caller's height class (h-[640px]) wins.
-->
<MobileAppFrame
  {header}
  bottomNav={stickyFooter || bottomNav ? bottom : undefined}
  {children}
  {mainId}
  {skipLabel}
  class={cn('ui-mobile-app-shell', className)}
  {mainClass}
/>
