<script lang="ts">
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
import LoaderCircle from '@lucide/svelte/icons/loader-circle';
import Play from '@lucide/svelte/icons/play';
import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
import X from '@lucide/svelte/icons/x';
import { Button, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import {
  COMPARE_DEVICE_IDS,
  type CompareState,
  defaultScenarios,
  PANE_IDS,
  type PaneId,
  paneUrl,
  paramsFromState,
  sandboxName,
  stateFromParams,
} from '@/lib/compare';
import { control } from '@/lib/control.svelte';
import { DEVICES, fitScale, frameFor, safePreviewUrl, withGalleryShellNone } from '@/lib/devices';
import CommandBlock from './CommandBlock.svelte';
import GallerySelect from './GallerySelect.svelte';

interface Props {
  slug: string;
  name: string;
  scenarios: string[];
  defaultScenario: string | null;
  /** Bundled build in a showcase site (base-prefixed), else null. */
  embeddedUrl: string | null;
  devCommand: string;
}
let { slug, name, scenarios, defaultScenario, embeddedUrl, devCommand }: Props = $props();

let state = $state<CompareState>({
  scenarios: defaultScenarios(scenarios, defaultScenario),
  device: 'laptop-window',
  generation: 0,
});
let hydrated = $state(false);
let manualUrl = $state('');
let manualError = $state('');
let pastedUrl = $state<string | null>(null);
let width = $state(0);
let grid: HTMLDivElement | undefined = $state();

const running = $derived(control.find(slug));
/** Where the frames point: the bundled build, a running dev server, or a pasted URL. */
const appUrl = $derived(embeddedUrl ?? running?.url ?? pastedUrl);
/**
 * A pasted URL may be any origin: frame it with an iframe sandbox so it cannot
 * navigate or script the gallery tab. Bundled builds and local dev servers
 * are trusted and keep full capabilities.
 */
const framePolicy = $derived(
  !embeddedUrl && !running && pastedUrl
    ? 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups'
    : undefined
);
const panes = $derived(
  state.scenarios.map((scenario, i) => ({ id: PANE_IDS[i] as PaneId, scenario }))
);
const device = $derived(frameFor(state.device));
// Each pane gets an equal share of the grid width (minus gaps).
const paneWidth = $derived(Math.max(0, (width - (panes.length - 1) * 16) / panes.length));
const scale = $derived(fitScale(paneWidth - 2, device.width));

onMount(() => {
  state = stateFromParams(new URLSearchParams(window.location.search), scenarios, defaultScenario);
  hydrated = true;
  if (!embeddedUrl) control.detect();
});

$effect(() => {
  if (!hydrated) return;
  const search = paramsFromState(state);
  if (search !== window.location.search) {
    history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }
});

$effect(() => {
  if (!grid) return;
  const observer = new ResizeObserver(([entry]) => {
    width = entry?.contentRect.width ?? 0;
  });
  observer.observe(grid);
  return () => observer.disconnect();
});

function setScenario(index: number, scenario: string) {
  state.scenarios = state.scenarios.map((s, i) => (i === index ? scenario : s));
}

function swap() {
  const [a, b, ...rest] = state.scenarios;
  state.scenarios = [b ?? '', a ?? '', ...rest];
}

function addPane() {
  if (state.scenarios.length >= 3) return;
  const unused = scenarios.find((s) => !state.scenarios.includes(s)) ?? scenarios[0] ?? '';
  state.scenarios = [...state.scenarios, unused];
}

function removePane() {
  state.scenarios = state.scenarios.slice(0, 2);
}

function resetSandboxes() {
  // New sandbox names → empty databases → each frame re-seeds its scenario.
  state.generation += 1;
}

async function usePasted(event: SubmitEvent) {
  event.preventDefault();
  manualError = '';
  const url = safePreviewUrl(manualUrl);
  if (!url) {
    manualError = 'Enter a full http:// or https:// URL.';
    return;
  }
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    pastedUrl = url;
  } catch {
    manualError = `Could not reach ${url}. Is the server running?`;
  }
}

const select = 'h-9 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg';
</script>

<section aria-labelledby="compare-title" class="space-y-4" data-hydrated={hydrated} data-testid="compare">
  <div class="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
    <h2 id="compare-title" class="sr-only">Compare scenarios of {name}</h2>
    <label class="flex flex-col gap-1 text-xs text-muted">
      <span>Device (all frames)</span>
      <GallerySelect class={select} bind:value={state.device} data-testid="compare-device" items={DEVICES.filter((d) => d.id !== 'custom').map((d) => ({ value: d.id, label: `${d.label} · ${d.width}×${d.height}` }))} />
    </label>
    <Button type="button" class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-surface-2" onclick={swap}>
      <LucideIcon icon={ArrowLeftRight} size={14} aria-hidden="true" /> Swap A and B
    </Button>
    {#if state.scenarios.length < 3}
      <Button type="button" class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-surface-2" onclick={addPane}>
        <Icon icon="plus" size={14} aria-hidden="true" /> Add a third frame
      </Button>
    {:else}
      <Button type="button" class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-surface-2" onclick={removePane}>
        <LucideIcon icon={X} size={14} aria-hidden="true" /> Remove frame C
      </Button>
    {/if}
    <Button
      type="button"
      class="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-surface-2"
      onclick={resetSandboxes}
      data-testid="compare-reset"
    >
      <LucideIcon icon={RotateCcw} size={14} aria-hidden="true" /> Reset sandboxes
    </Button>
  </div>

  <p class="text-xs text-muted">
    Each frame keeps its own isolated data (<code class="font-mono">?sandbox=…</code> gives it a
    separate database): changes stay in that frame and never touch the prototype's normal data. <strong class="font-medium text-fg">Reset sandboxes</strong>
    starts every frame from a fresh copy of its scenario.
  </p>

  {#if !appUrl}
    <div class="space-y-3 rounded-xl border border-line bg-surface p-4 text-sm" data-testid="compare-unavailable">
      {#if control.status === 'available'}
        <p>Start {name} to compare its scenarios side by side.</p>
        <Button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          disabled={control.busy[slug] === 'starting'}
          onclick={() => control.start(slug)}
        >
          {#if control.busy[slug] === 'starting'}<LucideIcon icon={LoaderCircle} size={14} class="animate-spin" aria-hidden="true" /> Starting…{:else}<LucideIcon icon={Play} size={14} aria-hidden="true" /> Start {name}{/if}
        </Button>
        {#if control.errors[slug]}<p class="text-xs text-danger" role="alert">{control.errors[slug]}</p>{/if}
      {:else if control.status === 'checking' || control.status === 'unknown'}
        <p class="inline-flex items-center gap-1.5 text-muted"><LucideIcon icon={LoaderCircle} size={14} class="animate-spin" aria-hidden="true" /> Looking for the local control server…</p>
      {:else}
        <p class="text-muted">
          This gallery has no bundled build of {name} and no local control server, so it cannot run frames here.
          Run the prototype yourself, then paste its URL. Each frame adds its own <code class="font-mono">?sandbox=</code> and
          <code class="font-mono">?scenario=</code>. Or build a showcase, where every prototype ships with the gallery.
        </p>
        <CommandBlock command={devCommand} label="Run it locally" />
        <CommandBlock command="pnpm protoyard showcase --serve" label="Or serve a showcase with every prototype bundled" />
        <form class="flex flex-wrap gap-2" onsubmit={usePasted}>
          <label class="min-w-56 flex-1">
            <span class="sr-only">Prototype URL</span>
            <Input type="url" inputmode="url" placeholder="http://localhost:5173/" class="h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs" bind:value={manualUrl} />
          </label>
          <Button type="submit" class="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Compare this URL</Button>
        </form>
        {#if manualError}<p class="text-xs text-danger" role="alert">{manualError}</p>{/if}
      {/if}
    </div>
  {/if}

  <div bind:this={grid} class={['grid gap-4', panes.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2']}>
    {#each panes as pane, index (pane.id)}
      <div class="min-w-0 rounded-xl border border-line bg-surface" data-testid={`compare-pane-${pane.id}`}>
        <div class="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <span aria-hidden="true" class="grid size-6 place-items-center rounded-md bg-accent-soft text-xs font-semibold uppercase text-accent-fg">{pane.id}</span>
          <label class="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span class="sr-only">Scenario for frame {pane.id.toUpperCase()}</span>
            <GallerySelect class={[select, 'min-w-0 flex-1']} value={pane.scenario} onValueChange={(value) => setScenario(index, value)} data-testid={`compare-scenario-${pane.id}`} items={scenarios.map((id) => ({ value: id, label: `${id}${id === defaultScenario ? ' (default)' : ''}` }))} />
          </label>
          {#if appUrl}
            <a
              class="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
              href={paneUrl(appUrl, pane.id, pane.scenario, state.generation)}
              target="_blank"
              rel="noopener"
            >
              Open<span class="sr-only"> frame {pane.id.toUpperCase()} in a new tab</span>
            </a>
          {/if}
        </div>
        <div class="overflow-hidden bg-surface-2 p-3">
          {#if appUrl}
            <div class="mx-auto" style:width="{device.width * scale}px" style:height="{device.height * scale}px">
              <div
                class={[
                  'origin-top-left overflow-hidden border border-line bg-white',
                  device.framed ? 'rounded-[28px] border-8 border-zinc-800' : 'rounded-lg',
                ]}
                style:width="{device.width}px"
                style:height="{device.height}px"
                style:transform="scale({scale})"
              >
                {#key paneUrl(appUrl, pane.id, pane.scenario, state.generation)}
                  <iframe
                    src={device.framed
                      ? withGalleryShellNone(paneUrl(appUrl, pane.id, pane.scenario, state.generation))
                      : paneUrl(appUrl, pane.id, pane.scenario, state.generation)}
                    title={`${name}, frame ${pane.id.toUpperCase()}: scenario ${pane.scenario} (sandbox ${sandboxName(pane.id, state.generation)})`}
                    class="size-full border-0"
                    data-sandbox={sandboxName(pane.id, state.generation)}
                    sandbox={framePolicy}
                  ></iframe>
                {/key}
              </div>
            </div>
          {:else}
            <div class="grid h-40 place-items-center text-xs text-muted">Frame {pane.id.toUpperCase()} · {pane.scenario}</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</section>
