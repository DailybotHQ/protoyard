<script lang="ts">
import type { Snippet } from 'svelte';

type Props = {
  title: string;
  children: Snippet;
};

let { title, children }: Props = $props();
const label = $derived(title.trim().endsWith('.') ? title.trim() : `${title.trim()}.`);

function markGeometry(node: HTMLElement) {
  const apply = () => {
    // Texuli bar marks use data-series; Protoyard tests and hosts look for data-bar.
    for (const rect of node.querySelectorAll(
      'svg rect[data-series], svg rect[data-bar-index], .plot rect'
    )) {
      if (!rect.hasAttribute('data-bar')) rect.setAttribute('data-bar', '');
    }
    for (const btn of node.querySelectorAll('button[data-chart-table-toggle], button')) {
      const text = (btn.textContent ?? '').trim();
      const isToggle =
        btn.hasAttribute('data-chart-table-toggle') ||
        text === 'Show data table' ||
        text === 'Hide data table' ||
        btn.getAttribute('data-py-relabel') === 'table' ||
        btn.getAttribute('data-py-relabel') === 'chart';
      if (!isToggle) continue;
      const open =
        btn.getAttribute('aria-expanded') === 'true' ||
        text === 'Hide data table' ||
        btn.getAttribute('data-py-relabel') === 'chart';
      // Protoyard hosts expect "View as table/chart" + aria-pressed (Texuli uses aria-expanded).
      btn.textContent = open ? 'View as chart' : 'View as table';
      btn.setAttribute('data-py-relabel', open ? 'chart' : 'table');
      btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    }
  };
  apply();
  const mo = new MutationObserver(apply);
  mo.observe(node, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'data-series'],
  });
  return { destroy: () => mo.disconnect() };
}

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
  use:markGeometry
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
