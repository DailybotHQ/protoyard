<script lang="ts">
import ExternalLink from '@lucide/svelte/icons/external-link';
import LoaderCircle from '@lucide/svelte/icons/loader-circle';
import Play from '@lucide/svelte/icons/play';
import RotateCw from '@lucide/svelte/icons/rotate-cw';
import Square from '@lucide/svelte/icons/square';
import { Button, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { control } from '@/lib/control.svelte';
import {
  DEVICES,
  type DeviceId,
  defaultGalleryDevice,
  fitScale,
  frameFor,
  type Orientation,
  safePreviewUrl,
  withGalleryShellNone,
} from '@/lib/devices';
import { library } from '@/lib/library.svelte';
import CommandBlock from './CommandBlock.svelte';
import GallerySelect from './GallerySelect.svelte';
import { THEME_ID_PATTERN, withThemeParam } from './marketplace/model';

interface Props {
  slug: string;
  name: string;
  /** Registry `preview.viewport` (legacy alias ok). */
  defaultViewport?: string;
  /** Resolved shell from registry catalog when present. */
  defaultShell?: string | null;
  /** Catalog device id from the manifest when present. */
  defaultDevice?: string | null;
  platform?: string | null;
  devCommand: string;
  /** Bundled static build in a showcase site (already base-prefixed). */
  embeddedUrl?: string | null;
  scenarios?: string[];
  defaultScenario?: string | null;
  /** Shown while nothing is previewed (already base-prefixed). */
  thumbnail?: string | null;
  /** Heading id; set it when a page shows more than one preview. */
  titleId?: string;
}
let {
  slug,
  name,
  defaultViewport = 'desktop',
  defaultShell = null,
  defaultDevice = null,
  platform = null,
  devCommand,
  embeddedUrl = null,
  scenarios = [],
  defaultScenario = null,
  thumbnail = null,
  titleId = 'preview-title',
}: Props = $props();
let scenario = $state('');
/** `?theme=<id>` on this page (the marketplace "Try in theme" links): passed on to the demo. */
let previewTheme = $state('');

const initialDevice = defaultGalleryDevice({
  viewport: defaultViewport,
  shell: defaultShell,
  device: defaultDevice,
  platform,
});

/** Scenario links use the runtime's `?scenario=<id>` contract (core parseScenarioLink). */
function embeddedHref(id: string) {
  if (!embeddedUrl) return '';
  return id ? `${embeddedUrl}?scenario=${encodeURIComponent(id)}` : embeddedUrl;
}

let device = $state<DeviceId>(initialDevice);
let orientation = $state<Orientation>('portrait');
let customWidth = $state(1024);
let customHeight = $state(768);
let manualUrl = $state('');
/** A pasted URL may be any origin: framed with an iframe sandbox (see below). */
let pasted = $state(false);
let manualError = $state('');
let previewUrl = $state<string | null>(null);
let loading = $state(false);
let slow = $state(false);
/** True after the 12s timer or an iframe error while still loading. */
let loadFailed = $state(false);
let reloadKey = $state(0);
let stage: HTMLDivElement | undefined = $state();
let stageWidth = $state(0);

const running = $derived(control.find(slug));
const busy = $derived(control.busy[slug]);
const error = $derived(control.errors[slug]);
const frame = $derived(
  frameFor(device, {
    customWidth,
    customHeight,
    orientation: device === 'custom' ? undefined : orientation,
  })
);
const scale = $derived(fitScale(stageWidth - 24, frame.width + (frame.framed ? 28 : 0)));
const canRotate = $derived(Boolean(frame.spec?.rotatable));
const iframeSrc = $derived(
  previewUrl ? (frame.framed ? withGalleryShellNone(previewUrl) : previewUrl) : null
);

function selectDevice(id: DeviceId) {
  device = id;
  const next = frameFor(id);
  orientation = next.spec?.orientation ?? 'portrait';
}

function toggleOrientation() {
  if (!canRotate) return;
  orientation = orientation === 'portrait' ? 'landscape' : 'portrait';
}

let hydrated = $state(false);

onMount(() => {
  hydrated = true;
  library.visit(slug);
  const theme = new URLSearchParams(window.location.search).get('theme') ?? '';
  if (THEME_ID_PATTERN.test(theme)) previewTheme = theme;
  if (embeddedUrl) {
    show(embeddedUrl);
    return;
  }
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
  // A pasted URL is someone else's app: it gets no theme parameter.
  previewUrl = previewTheme && !pasted ? withThemeParam(url, previewTheme) : url;
  loading = true;
  slow = false;
  loadFailed = false;
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => {
    if (loading) {
      slow = true;
      loadFailed = true;
    }
  }, 12_000);
}

function markLoaded() {
  loading = false;
  slow = false;
  loadFailed = false;
  clearTimeout(slowTimer);
}

function markFailed() {
  if (!loading) return;
  loadFailed = true;
  slow = true;
}

function retryPreview() {
  loadFailed = false;
  slow = false;
  loading = true;
  reloadKey += 1;
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => {
    if (loading) {
      slow = true;
      loadFailed = true;
    }
  }, 12_000);
}

async function start() {
  pasted = false;
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
    pasted = true;
    show(url);
  } catch {
    manualError = `Could not reach ${url}. Is the server running?`;
  }
}
</script>

<section aria-labelledby={titleId} class="rounded-xl border border-line bg-surface" data-hydrated={hydrated}>
  <div class="flex flex-wrap items-center gap-3 border-b border-line p-3">
    <h2 id={titleId} class="font-medium">Live preview</h2>
    <div role="group" aria-label="Device" class="flex flex-wrap rounded-lg border border-line bg-bg p-0.5" data-testid="devices">
      {#each DEVICES as d (d.id)}
        <Button variant="ghost"
          type="button"
          variant="ghost"
          class="rounded-md px-2.5 py-1 text-xs text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
          aria-pressed={device === d.id}
          onclick={() => selectDevice(d.id)}
        >
          {d.label}
        </Button>
      {/each}
      <Button variant="ghost"
        type="button"
        variant="ghost"
        class="rounded-md px-2.5 py-1 text-xs text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
        aria-pressed={device === 'custom'}
        onclick={() => selectDevice('custom')}
      >
        Custom
      </Button>
    </div>
    {#if device === 'custom'}
      <div class="flex items-center gap-1.5 text-xs text-muted">
        <label class="flex items-center gap-1">W <Input type="number" min="240" max="3840" class="h-7 w-20 rounded-md border border-line bg-bg px-2 text-fg" bind:value={customWidth} /></label>
        <label class="flex items-center gap-1">H <Input type="number" min="240" max="3840" class="h-7 w-20 rounded-md border border-line bg-bg px-2 text-fg" bind:value={customHeight} /></label>
      </div>
    {/if}
    {#if canRotate}
      <Button
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2"
        onclick={toggleOrientation}
        data-testid="rotate-device"
      >
        Rotate
      </Button>
    {/if}
    <span class="ml-auto text-xs text-muted">{frame.width}×{frame.height}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span>
  </div>

  {#if previewTheme}
    <p class="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted" data-testid="preview-theme">
      Previewing in the <code class="font-mono text-fg">{previewTheme}</code> theme.
      <a class="text-accent-fg underline-offset-2 hover:underline" href={window.location.pathname}>Use its default theme</a>
    </p>
  {/if}
  <div class="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm" data-testid="control-status">
    {#if embeddedUrl}
      <span class="inline-flex items-center gap-1.5 text-success"><span class="size-2 rounded-full bg-current"></span>Live demo</span>
      <span class="text-muted">bundled static build</span>
      {#if scenarios.length > 0}
        <label class="ml-auto flex items-center gap-1.5 text-muted">
          <span>Scenario</span>
          <GallerySelect class="h-8 max-w-48 rounded-lg border border-line bg-bg px-2 text-sm text-fg sm:max-w-none" bind:value={scenario} onValueChange={() => show(embeddedHref(scenario))} data-testid="scenario-select" items={[{ value: '', label: `Saved state${defaultScenario ? ` (first run: ${defaultScenario})` : ''}` }, ...scenarios.map((id) => ({ value: id, label: id }))]} />
        </label>
      {/if}
      <a class={['inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2', scenarios.length === 0 && 'ml-auto']} href={embeddedHref(scenario)} target="_blank" rel="noopener">
        <LucideIcon icon={ExternalLink} size={14} aria-hidden="true" /> Open
      </a>
      <Button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" onclick={() => (reloadKey += 1)}>
        <LucideIcon icon={RotateCw} size={14} aria-hidden="true" /> Reload
      </Button>
    {:else if control.status === 'available'}
      {#if running}
        <span class="inline-flex items-center gap-1.5 text-success"><span class="size-2 rounded-full bg-current"></span>Running at</span>
        <a class="font-mono text-xs underline underline-offset-2" href={running.url} target="_blank" rel="noopener">{running.url}</a>
        <a class="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={running.url} target="_blank" rel="noopener">
          <LucideIcon icon={ExternalLink} size={14} aria-hidden="true" /> Open
        </a>
        <Button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" onclick={() => (reloadKey += 1)}>
          <LucideIcon icon={RotateCw} size={14} aria-hidden="true" /> Reload
        </Button>
        <Button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-surface-2 disabled:opacity-50" disabled={busy === 'stopping'} onclick={stop}>
          <LucideIcon icon={Square} size={14} aria-hidden="true" /> {busy === 'stopping' ? 'Stopping…' : 'Stop'}
        </Button>
      {:else}
        <span class="text-muted">Local control server connected.</span>
        <Button type="button" class="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60" disabled={busy === 'starting'} onclick={start} data-testid="start">
          {#if busy === 'starting'}<LucideIcon icon={LoaderCircle} size={14} class="animate-spin" aria-hidden="true" /> Starting…{:else}<LucideIcon icon={Play} size={14} aria-hidden="true" /> Start {name}{/if}
        </Button>
      {/if}
      {#if error}<p class="w-full text-xs text-danger" role="alert">{error}</p>{/if}
    {:else if control.status === 'checking' || control.status === 'unknown'}
      <span class="inline-flex items-center gap-1.5 text-muted"><LucideIcon icon={LoaderCircle} size={14} class="animate-spin" aria-hidden="true" /> Looking for the local control server…</span>
    {:else}
      <div class="w-full space-y-2">
        <p class="text-muted">
          This gallery is read-only here (no local control server). Run the prototype from your terminal, then paste its URL to preview it:
        </p>
        <CommandBlock command={devCommand} />
        <form class="flex flex-wrap gap-2" onsubmit={openManual}>
          <label class="min-w-56 flex-1">
            <span class="sr-only">Prototype URL</span>
            <Input type="url" inputmode="url" placeholder="http://localhost:5173/" class="h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs" bind:value={manualUrl} />
          </label>
          <Button type="submit" class="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Preview URL</Button>
        </form>
        {#if manualError}<p class="text-xs text-danger" role="alert">{manualError}</p>{/if}
      </div>
    {/if}
  </div>

  <div bind:this={stage} class="overflow-hidden bg-surface-2 p-4" data-testid="preview-stage">
    {#if previewUrl && iframeSrc}
      {@const bezel = frame.framed ? 12 : 0}
      {@const outerW = frame.width + bezel * 2}
      {@const outerH = frame.height + bezel * 2}
      <div class="mx-auto" style:width="{outerW * scale}px" style:height="{outerH * scale}px">
        <div
          class="relative origin-top-left"
          style:width="{outerW}px"
          style:height="{outerH}px"
          style:transform="scale({scale})"
          data-testid="device-frame"
          data-py-gallery-frame={frame.framed ? (frame.spec?.kind ?? 'device') : 'plain'}
          data-py-cutout={frame.spec?.cutout ?? 'none'}
        >
          {#if frame.framed && frame.spec}
            <!-- Brand-neutral phone/tablet bezel matching the renderer PhoneFrame chrome. -->
            <div
              class="absolute border-solid border-zinc-800 bg-zinc-800 shadow-[0_0_0_1px_rgb(39_39_42),0_28px_70px_-24px_rgb(0_0_0/0.55)] dark:border-zinc-950 dark:bg-zinc-950"
              style:inset="0"
              style:border-width="{bezel}px"
              style:border-radius="{frame.spec.cornerRadius + bezel}px"
              aria-hidden="true"
              data-testid="device-bezel"
            ></div>
          {/if}
          <div
            class={[
              'absolute overflow-hidden bg-white',
              frame.framed ? '' : 'rounded-lg border border-line shadow-sm',
            ]}
            style:top="{bezel}px"
            style:left="{bezel}px"
            style:width="{frame.width}px"
            style:height="{frame.height}px"
            style:border-radius={frame.framed && frame.spec ? `${frame.spec.cornerRadius}px` : undefined}
            data-testid="device-screen"
          >
            {#if frame.framed && frame.spec}
              {#if frame.spec.cutout === 'pill'}
                <div
                  class="pointer-events-none absolute top-[11px] left-1/2 z-20 h-[28px] w-[96px] -translate-x-1/2 rounded-full bg-zinc-950"
                  aria-hidden="true"
                  data-testid="device-cutout"
                ></div>
              {:else if frame.spec.cutout === 'punch-hole'}
                <div
                  class="pointer-events-none absolute top-[12px] left-1/2 z-20 size-[11px] -translate-x-1/2 rounded-full bg-zinc-950"
                  aria-hidden="true"
                  data-testid="device-cutout"
                ></div>
              {/if}
              {#if frame.spec.statusBar.style !== 'none'}
                <div
                  class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-end justify-between px-5 pb-1.5 text-[11px] font-semibold text-zinc-900"
                  style:height="{Math.max(frame.spec.statusBar.height, frame.spec.safeArea[frame.orientation].top)}px"
                  aria-hidden="true"
                  data-testid="device-status-bar"
                >
                  <time datetime="09:41">9:41</time>
                  <span class="opacity-70">■■■</span>
                </div>
              {/if}
              {#if frame.spec.homeIndicator.height > 0}
                <div
                  class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2"
                  style:height="{frame.spec.homeIndicator.height}px"
                  aria-hidden="true"
                  data-testid="device-home-indicator"
                >
                  <span class="block h-1 w-[36%] max-w-[140px] rounded-full bg-zinc-900/35"></span>
                </div>
              {/if}
            {/if}
            {#key `${iframeSrc}#${reloadKey}`}
              <iframe
                src={iframeSrc}
                title={`${name} preview (${frame.label})`}
                class="size-full border-0"
                sandbox={pasted ? 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups' : undefined}
                onload={markLoaded}
                onerror={markFailed}
              ></iframe>
            {/key}
            {#if loading && !loadFailed}
              <div
                class="absolute inset-0 z-30 flex flex-col bg-[color:var(--tx-bg,#fafafa)] dark:bg-[color:var(--tx-bg,#09090b)]"
                style:padding-top={frame.framed && frame.spec ? `${Math.max(frame.spec.statusBar.height, 12)}px` : '0'}
                style:padding-bottom={frame.framed && frame.spec ? `${frame.spec.homeIndicator.height}px` : '0'}
                aria-live="polite"
                aria-busy="true"
                data-testid="preview-skeleton"
              >
                <div class="flex flex-1 flex-col gap-3 p-4">
                  <div class="py-skeleton h-3 w-1/3 rounded-md"></div>
                  <div class="py-skeleton h-8 w-2/3 rounded-md"></div>
                  <div class="py-skeleton mt-2 h-24 w-full flex-1 rounded-lg"></div>
                  <div class="flex gap-2">
                    <div class="py-skeleton h-9 flex-1 rounded-md"></div>
                    <div class="py-skeleton h-9 flex-1 rounded-md"></div>
                  </div>
                </div>
                <p class="px-4 pb-3 text-center text-xs text-muted">
                  {slow ? 'Still loading — check the dev server output.' : `Loading ${name}…`}
                </p>
              </div>
            {:else if loadFailed}
              <div
                class="absolute inset-0 z-30 grid place-items-center bg-surface/95 p-4 text-center"
                role="alert"
                data-testid="preview-error"
              >
                <div class="max-w-sm space-y-3">
                  <p class="text-sm font-medium text-fg">Preview did not load</p>
                  <p class="text-xs text-muted">
                    The frame stayed blank for too long, or the browser reported an error. Confirm the
                    prototype is running, then retry.
                  </p>
                  <div class="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
                      data-testid="preview-retry"
                      onclick={retryPreview}
                    >
                      <LucideIcon icon={RotateCw} size={14} aria-hidden="true" /> Retry
                    </Button>
                    {#if previewUrl}
                      <a
                        class="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
                        href={previewUrl}
                        target="_blank"
                        rel="noopener"
                      >
                        <LucideIcon icon={ExternalLink} size={14} aria-hidden="true" /> Open in tab
                      </a>
                    {/if}
                  </div>
                  <CommandBlock command={devCommand} />
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="grid min-h-64 place-items-center gap-3 text-center text-sm text-muted">
        {#if thumbnail}
          <img src={thumbnail} alt={`Screenshot of ${name}`} class="max-h-[28rem] w-auto max-w-full rounded-lg border border-line shadow-sm" />
        {/if}
        <p>{control.status === 'available' ? `Start ${name} to see it here.` : 'No live preview yet.'}</p>
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
