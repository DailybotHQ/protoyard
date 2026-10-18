<script lang="ts">
import { BrowserChrome } from '@protoyard/ui';
import { onMount } from 'svelte';
import { getRuntime } from '../../context.ts';
import { FRAMES, type FrameProps, screenInsetOf } from './registry.ts';

/**
 * Browser shell decoration: tab + address bar over the device screen using
 * `@protoyard/ui` BrowserChrome. Origin comes from `preview.chrome.origin`
 * (default `https://<slug>.example`). The app stays in ShellHost's screen;
 * chrome controls are pointer-events targets; the content pane is transparent
 * so clicks reach the prototype underneath. Back/forward use the real history
 * API (same as the hash router).
 */
let { shell }: FrameProps = $props();
/** Tab strip (40 px) + address bar (48 px): the space ShellHost reserves above the app. */
const toolbarHeight = screenInsetOf(FRAMES.browser).top;

const runtime = getRuntime();
const origin = $derived(
  runtime.definition.manifest.preview.chrome?.origin ??
    `https://${runtime.definition.manifest.slug}.example`
);
const fallbackTitle = $derived(runtime.definition.manifest.name || 'Prototype');

let title = $state(
  typeof document !== 'undefined' && document.title ? document.title : 'Prototype'
);

function readTitle(): string {
  const current = typeof document !== 'undefined' ? document.title.trim() : '';
  return current || fallbackTitle;
}

onMount(() => {
  title = readTitle();
  const titleEl = document.querySelector('title');
  const observer =
    typeof MutationObserver !== 'undefined' && titleEl
      ? new MutationObserver(() => {
          title = readTitle();
        })
      : null;
  if (observer && titleEl) {
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  const onHash = () => {
    // Router updates document.title on hashchange; read after the handler runs.
    setTimeout(() => {
      title = readTitle();
    }, 0);
  };
  window.addEventListener('hashchange', onHash);
  return () => {
    observer?.disconnect();
    window.removeEventListener('hashchange', onHash);
  };
});
</script>

<!--
  Exactly toolbar-tall: ShellHost already starts the app's screen below it
  (screenInset.top), so the frame never paints over the app. BrowserChrome's own
  content pane is empty here and hidden.
-->
<div
  class="pointer-events-none absolute inset-x-0 top-0 z-[2] flex min-h-0 flex-col"
  style:height="{toolbarHeight}px"
  data-py-frame="browser"
  data-py-frame-shell={shell}
  data-py-browser-origin={origin}
>
  <BrowserChrome
    {origin}
    {title}
    class="pointer-events-auto h-full min-h-0 rounded-none border-0 shadow-none [&>div:last-child]:hidden"
  />
</div>
