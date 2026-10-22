<script lang="ts">
/**
 * One content snippet, three presentations: bottom sheet on narrow hosts,
 * centered dialog or side panel on wider hosts. Composes the shared Dialog,
 * BottomSheet and DetailPanel primitives so focus, Escape, labeling and close
 * stay identical to opening those components directly.
 */
import type { Snippet } from 'svelte';
import { onMount } from 'svelte';
import type { TriggerSnippet } from '../../lib/types.ts';
import BottomSheet from '../bottom-sheet/BottomSheet.svelte';
import DetailPanel from '../detail-panel/DetailPanel.svelte';
import Dialog from '../dialog/Dialog.svelte';
import {
  ADAPTIVE_OVERLAY_BREAKPOINT,
  type AdaptiveOverlayMode,
  type AdaptiveOverlayPresentation,
  type AdaptiveOverlayWideKind,
  resolveAdaptiveOverlayPresentation,
} from './resolve.ts';

interface Props {
  open?: boolean;
  title: string;
  description?: string;
  /** Desktop target when the host is wide. Phone/narrow always uses the sheet. */
  kind?: AdaptiveOverlayWideKind;
  /**
   * Force a presentation (`sheet` | `dialog` | `side-panel`) or `auto` to
   * measure the host/container. Default `auto`.
   */
  force?: AdaptiveOverlayMode;
  /** Dialog / side-panel size token. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Width breakpoint in CSS px (default 768). */
  breakpoint?: number;
  /**
   * Element whose client width drives auto selection. Defaults to the nearest
   * `[data-py-app-host]`, then `#app`, then `document.documentElement`.
   */
  host?: Element | null;
  hideTitle?: boolean;
  hideClose?: boolean;
  closeLabel?: string;
  trigger?: TriggerSnippet;
  footer?: Snippet;
  children?: Snippet;
  onOpenChange?: (open: boolean) => void;
  class?: string;
}

let {
  open = $bindable(false),
  title,
  description,
  kind = 'dialog',
  force = 'auto',
  size = 'md',
  breakpoint = ADAPTIVE_OVERLAY_BREAKPOINT,
  host = null,
  hideTitle = false,
  hideClose = false,
  closeLabel = 'Close',
  trigger,
  footer,
  children,
  onOpenChange,
  class: className,
}: Props = $props();

let measuredWidth = $state(0);
let observer: ResizeObserver | undefined;

function resolveHost(): Element | null {
  if (host) return host;
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector('[data-py-app-host]') ??
    document.getElementById('app') ??
    document.documentElement
  );
}

function measure(el: Element | null): void {
  if (!el) {
    measuredWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    return;
  }
  measuredWidth = el.getBoundingClientRect().width || (el as HTMLElement).clientWidth || 0;
}

const presentation = $derived.by(
  (): AdaptiveOverlayPresentation =>
    resolveAdaptiveOverlayPresentation({
      width: measuredWidth,
      kind,
      force,
      breakpoint,
    })
);

onMount(() => {
  const el = resolveHost();
  measure(el);
  if (el && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
  } else if (typeof window !== 'undefined') {
    const onResize = () => measure(resolveHost());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }
  return () => observer?.disconnect();
});
</script>

{#if presentation === 'sheet'}
  <BottomSheet
    bind:open
    {title}
    {description}
    {hideTitle}
    {trigger}
    {footer}
    {onOpenChange}
    class={className}
  >
    {#if children}{@render children()}{/if}
  </BottomSheet>
{:else if presentation === 'side-panel'}
  <DetailPanel
    bind:open
    {title}
    {description}
    {size}
    {trigger}
    {footer}
    {closeLabel}
    {onOpenChange}
    class={className}
  >
    {#if children}{@render children()}{/if}
  </DetailPanel>
{:else}
  <Dialog
    bind:open
    {title}
    {description}
    {size}
    {trigger}
    {footer}
    {hideClose}
    {closeLabel}
    {onOpenChange}
    class={className}
  >
    {#if children}{@render children()}{/if}
  </Dialog>
{/if}

<!-- Expose the resolved presentation for tests and hosts (no visual chrome). -->
{#if open}
  <span class="sr-only" data-adaptive-overlay-presentation={presentation} aria-hidden="true"></span>
{/if}
