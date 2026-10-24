<script lang="ts">
/**
 * Thin named-group wrapper around a Texuli chart. No DOM polyfills: Texuli
 * owns table disclosure ("Show data table" / aria-expanded) and mark hooks
 * (data-series on bar rects). Tests and hosts use those contracts directly.
 */
import type { Snippet } from 'svelte';

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
  class="py-chart-root"
  data-py-chart=""
  role="group"
  aria-label={label}
  tabindex="0"
  use:forwardFocus
>
  {@render children()}
</div>

<style>
  .py-chart-root {
    display: grid;
    min-inline-size: 0;
  }
  .py-chart-root:focus {
    outline: 2px solid var(--py-ring, Highlight);
    outline-offset: 2px;
  }
</style>
