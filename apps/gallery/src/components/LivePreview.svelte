<script lang="ts">
import ExternalLink from '@lucide/svelte/icons/external-link';
import LoaderCircle from '@lucide/svelte/icons/loader-circle';
import Play from '@lucide/svelte/icons/play';
import RotateCw from '@lucide/svelte/icons/rotate-cw';
import Square from '@lucide/svelte/icons/square';
import { onMount } from 'svelte';
import { control } from '@/lib/control.svelte';
import {
  clampDimension,
  DEVICES,
  type Device,
  type DeviceId,
  fitScale,
  safePreviewUrl,
} from '@/lib/devices';
import { library } from '@/lib/library.svelte';
import CommandBlock from './CommandBlock.svelte';

interface Props {
  slug: string;
  name: string;
  defaultViewport: DeviceId;
  devCommand: string;
}
let { slug, name, defaultViewport, devCommand }: Props = $props();

let device = $state<DeviceId>(defaultViewport);
let customWidth = $state(1024);
let customHeight = $state(768);
let manualUrl = $state('');
let manualError = $state('');
let previewUrl = $state<string | null>(null);
let loading = $state(false);
let slow = $state(false);
let reloadKey = $state(0);
let stage: HTMLDivElement | undefined = $state();
let stageWidth = $state(0);

const running = $derived(control.find(slug));
const busy = $derived(control.busy[slug]);
const error = $derived(control.errors[slug]);
const frame = $derived.by(() => {
  const preset = DEVICES.find((d) => d.id === device) ?? (DEVICES[0] as Device);
  return device === 'custom'
    ? { ...preset, width: clampDimension(customWidth), height: clampDimension(customHeight) }
    : preset;
});
const scale = $derived(fitScale(stageWidth - 2, frame.width));

onMount(() => {
  library.visit(slug);
  control.detect().then(() => {
    if (running) show(running.url);
  });
});

$effect(() => {
  if (!stage) return;
  const observer = new ResizeObserver(([entry]) => {
    stageWidth = entry?.contentRect.width ?? 0;
  });
  observer.observe(stage);
  return () => observer.disconnect();
});

let slowTimer: ReturnType<typeof setTimeout> | undefined;
function show(url: string) {
  previewUrl = url;
  loading = true;
  slow = false;
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => {
    if (loading) slow = true;
  }, 12_000);
}

async function start() {
  const server = await control.start(slug);
  if (server) show(server.url);
}

async function stop() {
  await control.stop(slug);
  previewUrl = null;
}

async function openManual(event: SubmitEvent) {
  event.preventDefault();
  manualError = '';
  const url = safePreviewUrl(manualUrl);
  if (!url) {
    manualError = 'Enter a full http:// or https:// URL.';
    return;
  }
  // An unreachable server rejects even in no-cors mode, so we can say so
  // instead of framing a browser error page.
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    show(url);
  } catch {
    manualError = `Could not reach ${url}. Is the server running?`;
  }
}
</script>

<section aria-labelledby="preview-title" class="rounded-xl border border-line bg-surface">
  <div class="flex flex-wrap items-center gap-3 border-b border-line p-3">
    <h2 id="preview-title" class="font-medium">Live preview</h2>
    <div role="group" aria-label="Device" class="flex flex-wrap rounded-lg border border-line bg-bg p-0.5" data-testid="devices">
      {#each DEVICES as d (d.id)}
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
          aria-pressed={device === d.id}
          onclick={() => (device = d.id)}
        >
          {d.label}
        </button>
      {/each}
    </div>
    {#if device === 'custom'}
      <div class="flex items-center gap-1.5 text-xs text-muted">
        <label class="flex items-center gap-1">W <input type="number" min="240" max="3840" class="h-7 w-20 rounded-md border border-line bg-bg px-2 text-fg" bind:value={customWidth} /></label>
        <label class="flex items-center gap-1">H <input type="number" min="240" max="3840" class="h-7 w-20 rounded-md border border-line bg-bg px-2 text-fg" bind:value={customHeight} /></label>
      </div>
    {/if}
    <span class="ml-auto text-xs text-muted">{frame.width}×{frame.height}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span>
  </div>

  <div class="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm" data-testid="control-status">
    {#if control.status === 'available'}
      {#if running}
        <span class="inline-flex items-center gap-1.5 text-success"><span class="size-2 rounded-full bg-current"></span>Running at</span>
        <a class="font-mono text-xs underline underline-offset-2" href={running.url} target="_blank" rel="noopener">{running.url}</a>
        <a class="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={running.url} target="_blank" rel="noopener">
          <ExternalLink size={14} aria-hidden="true" /> Open
        </a>
        <button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" onclick={() => (reloadKey += 1)}>
          <RotateCw size={14} aria-hidden="true" /> Reload
        </button>
        <button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2 disabled:opacity-50" disabled={busy === 'stopping'} onclick={stop}>
          <Square size={14} aria-hidden="true" /> {busy === 'stopping' ? 'Stopping…' : 'Stop'}
        </button>
      {:else}
        <span class="text-muted">Local control server connected.</span>
        <button type="button" class="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover disabled:opacity-60" disabled={busy === 'starting'} onclick={start} data-testid="start">
          {#if busy === 'starting'}<LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Starting…{:else}<Play size={14} aria-hidden="true" /> Start {name}{/if}
        </button>
      {/if}
      {#if error}<p class="w-full text-xs text-danger" role="alert">{error}</p>{/if}
    {:else if control.status === 'checking' || control.status === 'unknown'}
      <span class="inline-flex items-center gap-1.5 text-muted"><LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Looking for the local control server…</span>
    {:else}
      <div class="w-full space-y-2">
        <p class="text-muted">
          This gallery is read-only here (no local control server). Run the prototype from your terminal, then paste its URL to preview it:
        </p>
        <CommandBlock command={devCommand} />
        <form class="flex flex-wrap gap-2" onsubmit={openManual}>
          <label class="min-w-56 flex-1">
            <span class="sr-only">Prototype URL</span>
            <input type="url" inputmode="url" placeholder="http://localhost:5173/" class="h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs" bind:value={manualUrl} />
          </label>
          <button type="submit" class="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Preview URL</button>
        </form>
        {#if manualError}<p class="text-xs text-danger" role="alert">{manualError}</p>{/if}
      </div>
    {/if}
  </div>

  <div bind:this={stage} class="overflow-hidden bg-surface-2 p-4">
    {#if previewUrl}
      <div class="mx-auto" style:width="{frame.width * scale}px" style:height="{frame.height * scale}px">
        <div
          class={['relative origin-top-left overflow-hidden border border-line bg-white shadow-sm', frame.rounded ? 'rounded-[28px] border-8 border-zinc-800' : 'rounded-lg']}
          style:width="{frame.width}px"
          style:height="{frame.height}px"
          style:transform="scale({scale})"
        >
          {#key `${previewUrl}#${reloadKey}`}
            <iframe
              src={previewUrl}
              title={`${name} preview (${frame.label})`}
              class="size-full border-0"
              onload={() => {
                loading = false;
                slow = false;
              }}
            ></iframe>
          {/key}
          {#if loading}
            <div class="absolute inset-0 grid place-items-center bg-surface/80 text-sm text-muted" aria-live="polite">
              <span class="inline-flex items-center gap-2"><LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{slow ? 'Still loading — check the dev server output.' : 'Loading…'}</span>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="grid h-64 place-items-center text-center text-sm text-muted">
        <p>{control.status === 'available' ? `Start ${name} to see it here.` : 'No preview yet.'}</p>
      </div>
    {/if}
  </div>
  <p class="border-t border-line p-3 text-xs text-muted">
    Each prototype stores its data in IndexedDB for the address it runs on. Data you create at
    <code class="font-mono">localhost:5173</code> is separate from a build at
    <code class="font-mono">localhost:4173</code> or a published URL, and the framed preview shares
    storage with that address opened directly.
  </p>
</section>
