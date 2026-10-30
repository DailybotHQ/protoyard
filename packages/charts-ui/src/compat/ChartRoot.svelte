<script lang="ts">
/**
 * Thin named-group wrapper around a Texuli chart. No DOM polyfills: Texuli
 * owns table disclosure ("Show data table" / aria-expanded) and mark hooks
 * (data-series on bar rects). Tests and hosts use those contracts directly.
 */
import type { Snippet } from 'svelte';
import { cx } from 'texuli/cx';
import { TEXULI_CHART_TOKENS } from './theme-tokens.ts';

type Props = {
  title: string;
  children: Snippet;
};

let { title, children }: Props = $props();
const label = $derived(title.trim().endsWith('.') ? title.trim() : `${title.trim()}.`);

/**
 * DrillDown and other hosts focus this named group; forward into the first
 * interactive Texuli surface so keyboard users land on the plot.
 */
function forwardFocus(node: HTMLElement) {
  const onFocus = () => {
    const inner = node.querySelector<HTMLElement>(
      '[role="application"], [data-interactive="true"], svg[tabindex], [tabindex="0"]'
    );
    if (inner && document.activeElement === node) inner.focus();
  };
  node.addEventListener('focus', onFocus);
  return {
    destroy() {
      node.removeEventListener('focus', onFocus);
    },
  };
}
</script>

<!-- tabindex=0 so analytics DrillDown can focus the named group, then we forward into Texuli. -->
<div
  class={cx('py-chart-root', 'grid min-w-0')}
  data-py-chart=""
  style={TEXULI_CHART_TOKENS}
  role="group"
  aria-label={label}
  tabindex="0"
  use:forwardFocus
>
  {@render children()}
</div>

<style>
  .py-chart-root:focus {
    outline: 2px solid var(--tx-ring, Highlight);
    outline-offset: 2px;
  }
  /*
   * Texuli gap: a cartesian chart lays its plot out at most 640 px wide (the
   * plot carries an inline max-inline-size), but its canvas layer fills the
   * whole figure (absolute, inset 0). In a wider figure the canvas marks
   * stretch past the axes and the pointer explorer. Hold the canvas layer to
   * the plot's box: the plot starts at the inline start, up to 640 px.
   */
  .py-chart-root :global(.plot > .canvas-layer) {
    inset-inline-end: auto;
    inline-size: min(100%, 640px);
  }
</style>
