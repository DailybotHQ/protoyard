<script lang="ts">
import ArrowLeft from '@lucide/svelte/icons/arrow-left';
import ArrowRight from '@lucide/svelte/icons/arrow-right';
import Globe2 from '@lucide/svelte/icons/globe-2';
import RotateCw from '@lucide/svelte/icons/rotate-cw';
import type { Snippet } from 'svelte';
import { onMount } from 'svelte';
import { IconButton } from 'texuli/button';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import Input from '../input/Input.svelte';
import { formatAddress, parseAddress } from './address.ts';

interface Props {
  origin: string;
  title?: string;
  class?: string;
  children?: Snippet;
}

let { origin, title = 'Prototype', class: className, children }: Props = $props();

let addressValue = $state('');
let routeHistory = $state<string[]>([]);
let historyIndex = $state(-1);
let canGoBack = $derived(historyIndex > 0);
let canGoForward = $derived(historyIndex >= 0 && historyIndex < routeHistory.length - 1);
let skipNextHashChange = false;

function currentHash(): string {
  return window.location.hash || '#/';
}

function syncAddress(route: string): void {
  addressValue = formatAddress(origin, route);
}

function recordRoute(route: string): void {
  if (routeHistory[historyIndex] === route) return;
  routeHistory = [...routeHistory.slice(0, historyIndex + 1), route];
  historyIndex = routeHistory.length - 1;
}

function handleHashChange(): void {
  const route = currentHash();
  if (skipNextHashChange) {
    skipNextHashChange = false;
  } else {
    recordRoute(route);
  }
  syncAddress(route);
}

function handlePopState(): void {
  const route = currentHash();
  const previousRoute = routeHistory[historyIndex];
  if (routeHistory[historyIndex - 1] === route) {
    historyIndex -= 1;
  } else if (routeHistory[historyIndex + 1] === route) {
    historyIndex += 1;
  } else {
    const existingIndex = routeHistory.lastIndexOf(route);
    if (existingIndex >= 0) historyIndex = existingIndex;
    else recordRoute(route);
  }
  skipNextHashChange = route !== previousRoute;
  syncAddress(route);
}

function submitAddress(event: SubmitEvent): void {
  event.preventDefault();
  const route = parseAddress(addressValue);
  addressValue = formatAddress(origin, route);
  if (window.location.hash === route) {
    window.dispatchEvent(new Event('hashchange'));
    return;
  }
  recordRoute(route);
  window.location.hash = route;
}

function reloadRoute(): void {
  window.dispatchEvent(new Event('hashchange'));
}

onMount(() => {
  const initialRoute = currentHash();
  routeHistory = [initialRoute];
  historyIndex = 0;
  syncAddress(initialRoute);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);
  return () => {
    window.removeEventListener('hashchange', handleHashChange);
    window.removeEventListener('popstate', handlePopState);
  };
});
</script>

<!-- A fake browser frame (a legitimate Protoyard host chrome) built from Texuli's IconButton, Input and Icon. -->
<section class={cx('flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-soft', className)}>
  <div class="flex h-10 shrink-0 items-end gap-1 border-b border-border bg-muted/70 px-2 pt-1" role="tablist" aria-label="Browser tabs">
    <div class="flex h-9 max-w-64 min-w-36 items-center gap-2 rounded-t-lg border border-border border-b-background bg-background px-3 text-sm" role="tab" aria-selected="true" tabindex="0">
      <Icon icon={Globe2} size="sm" class="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="truncate">{title}</span>
    </div>
  </div>

  <div class="flex min-h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
    <IconButton label="Back" disabled={!canGoBack} onclick={() => window.history.back()}>
      <Icon icon={ArrowLeft} size="sm" aria-hidden="true" />
    </IconButton>
    <IconButton label="Forward" disabled={!canGoForward} onclick={() => window.history.forward()}>
      <Icon icon={ArrowRight} size="sm" aria-hidden="true" />
    </IconButton>
    <IconButton label="Reload" onclick={reloadRoute}>
      <Icon icon={RotateCw} size="sm" aria-hidden="true" />
    </IconButton>
    <form class="min-w-0 flex-1" onsubmit={submitAddress}>
      <label class="sr-only" for="browser-address">Address</label>
      <div class="flex h-10 min-h-touch items-center gap-2 rounded-full border border-input bg-muted/50 px-3 focus-within:ring-2 focus-within:ring-ring">
        <Icon icon={Globe2} size="sm" class="shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          id="browser-address"
          class="ui-browser-address"
          type="text"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          bind:value={addressValue}
        />
      </div>
    </form>
  </div>

  <div class="min-h-0 flex-1 overflow-auto bg-background">
    {@render children?.()}
  </div>
</section>

<style>
  /* The address pill draws the field; the input inside is borderless. */
  :global(.ui-browser-address) {
    flex: 1 1 auto;
    min-inline-size: 0;
    block-size: auto;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
</style>
