<script lang="ts">
import { ChevronDown } from '@lucide/svelte';
import {
  type ColorMode,
  DEVICES,
  type DeviceId,
  deviceFitsShell,
  getDevice,
  LAYOUTS,
  type LayoutId,
  layoutChoices,
  type Orientation,
  type Platform,
  type Shell,
  STYLE_OVERRIDE_KEYS,
  type Theme,
  type ViewportPreset,
} from '@protoyard/core';
import Btn from '../primitives/Btn.svelte';
import InlineError from '../primitives/InlineError.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import SourceBadge from '../primitives/SourceBadge.svelte';
import Toggle from '../primitives/Toggle.svelte';
import type { DevtoolsState } from '../state.svelte.ts';
import StyleControls from './StyleControls.svelte';
import ThemeBrowser from './ThemeBrowser.svelte';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const appearance = $derived(dt.appearance);
// The runtime's list also holds Theme Studio custom themes; re-read when appearance changes.
const themes = $derived.by<readonly Theme[]>(() => {
  void appearance;
  const known = runtime.theme.themes();
  return known.length ? [...known] : dt.themes;
});
/** The Studio is its own chunk: it loads only when someone opens it. */
let studioOpen = $state(false);
const loadStudio = () => import('./ThemeStudioSection.svelte');
const platform = $derived(runtime.manifest.platform);
const overrides = $derived(dt.overrides);
const layoutSettings = $derived(runtime.manifest.preview.layout);
const showLayoutPicker = $derived(
  (layoutSettings?.id ?? 'custom') !== 'custom' || layoutSettings?.supported !== undefined
);
const layoutOptions = $derived(
  layoutChoices(layoutSettings).map((id) => ({
    value: id,
    label: LAYOUTS.find((layout) => layout.id === id)?.label ?? id,
  }))
);

/** `override` = temporary design preview; `preference` = saved on the persona. */
let target = $state<'override' | 'preference'>('override');
/** Last framed shell while "frame off" forces `none` (so turning the frame back on restores it). */
let lastFramedShell = $state<Shell>('phone');
let moreShellsOpen = $state(false);

const hasOverride = $derived(
  [
    'themeId',
    'mode',
    'reducedMotion',
    'viewport',
    'density',
    'shell',
    'device',
    'orientation',
    'layout',
    ...STYLE_OVERRIDE_KEYS,
  ].some((key) => overrides[key as keyof typeof overrides] !== undefined)
);

/** Any appearance change in flight: the controls wait for it (no double triggers). */
const applying = $derived(dt.isBusy('appearance'));
const layoutApplying = $derived(dt.isBusy('appearance:layout'));

async function setLayout(layout: LayoutId) {
  await dt.run('appearance:layout', () => runtime.theme.setOverride({ layout }));
}

async function set(
  patch: { themeId?: string; mode?: ColorMode; reducedMotion?: boolean },
  key = 'appearance:look'
) {
  await dt.run(key, () =>
    target === 'override' ? runtime.theme.setOverride(patch) : runtime.theme.setPreference(patch)
  );
}

/** Shell / device / orientation are always temporary overrides (like density and viewport). */
async function setShellPatch(patch: {
  shell?: Shell;
  device?: DeviceId;
  orientation?: Orientation;
}) {
  if (patch.shell !== undefined && patch.shell !== 'none') {
    lastFramedShell = patch.shell;
  }
  await dt.run('appearance:shell', () => runtime.theme.setOverride(patch));
}

const viewports: { value: ViewportPreset; label: string }[] = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
];

const SHELL_OPTIONS: { value: Shell; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'none', label: 'None' },
  { value: 'phone', label: 'Phone' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop-window', label: 'Window' },
  { value: 'browser', label: 'Browser' },
  { value: 'widget-host', label: 'Widget' },
  { value: 'extension-popup', label: 'Ext. popup' },
  { value: 'side-panel', label: 'Side panel' },
];

/** Shells that fit the prototype platform first; everything else lives under More. */
function primaryShellValues(p: Platform): readonly Shell[] {
  if (p === 'mobile') return ['auto', 'phone', 'tablet', 'none'];
  if (p === 'desktop') return ['auto', 'none', 'desktop-window', 'browser', 'phone'];
  return ['auto', 'none', 'phone', 'desktop-window', 'browser'];
}

const primaryShells = $derived(
  SHELL_OPTIONS.filter((option) => primaryShellValues(platform).includes(option.value))
);
const moreShells = $derived(
  SHELL_OPTIONS.filter((option) => !primaryShellValues(platform).includes(option.value))
);

/**
 * Control value for the shell radios: the override when set, else the manifest
 * preview shell (often `auto`). Appearance always reports a resolved shell.
 */
const shellControlValue = $derived<Shell>(
  overrides.shell ?? runtime.manifest.preview.shell ?? 'auto'
);

const frameOn = $derived(appearance.shell.value !== 'none');

const devicesForShell = $derived(
  DEVICES.filter((device) => deviceFitsShell(device.id, appearance.shell.value))
);

const deviceControlValue = $derived<DeviceId>(appearance.device.value);
const deviceSpec = $derived(getDevice(deviceControlValue));
const orientationValue = $derived<Orientation>(appearance.orientation.value);
const canRotate = $derived(Boolean(deviceSpec?.rotatable));

async function setFrame(on: boolean) {
  if (on) {
    const restore =
      lastFramedShell !== 'none'
        ? lastFramedShell
        : platform === 'mobile'
          ? 'phone'
          : 'desktop-window';
    await setShellPatch({ shell: restore });
  } else {
    if (shellControlValue !== 'none') lastFramedShell = shellControlValue;
    await setShellPatch({ shell: 'none' });
  }
}
</script>

<Section title="Apply changes as">
  <Segmented
    label="Where appearance changes are stored"
    value={target}
    options={[
      { value: 'override', label: 'Temporary override' },
      { value: 'preference', label: 'Persona preference' },
    ]}
    onchange={(v) => (target = v)}
  />
  <p class="mt-1.5 text-[11px] text-muted-foreground">
    {target === 'override'
      ? 'A design preview for you only; the persona keeps its own choice.'
      : `Saved for ${dt.principal?.persona.name ?? 'the active persona'} and restored when you switch back.`}
  </p>
</Section>

<Section title="Theme">
  {#snippet actions()}<SourceBadge source={appearance.theme.source} />{/snippet}
  <ThemeBrowser {dt} {themes} select={(themeId) => set({ themeId }, `appearance:theme:${themeId}`)} />
  <InlineError message={dt.errorFor('appearance')} />
</Section>

<Section title="Theme Studio" description="Create a theme from a brand color, preview it live, save, export or import it.">
  {#snippet actions()}
    <Btn aria-expanded={studioOpen} onclick={() => (studioOpen = !studioOpen)}>
      {studioOpen ? 'Close studio' : 'Open studio'}
    </Btn>
  {/snippet}
  {#if studioOpen}
    {#await loadStudio()}
      <p class="text-xs text-muted-foreground" role="status">Loading Theme Studio…</p>
    {:then { default: ThemeStudio }}
      <ThemeStudio {dt} />
    {:catch error}
      <p class="text-xs text-destructive" role="alert">Theme Studio could not load: {error instanceof Error ? error.message : String(error)}</p>
    {/await}
  {/if}
</Section>
<Section title="Color mode">
  {#snippet actions()}<SourceBadge source={appearance.mode.source} />{/snippet}
  <Segmented
    label="Color mode"
    value={appearance.mode.value}
    options={[
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'system', label: 'System' },
    ]}
    busy={applying}
    onchange={(mode: ColorMode) => set({ mode })}
  />
  {#if appearance.mode.value === 'system'}
    <p class="mt-1.5 text-[11px] text-muted-foreground">System currently resolves to {appearance.resolvedMode}.</p>
  {/if}
  <div class="mt-2.5 flex items-center justify-between">
    <Toggle
      checked={appearance.reducedMotion.value}
      label="Reduced motion"
      onchange={(reducedMotion) => set({ reducedMotion })}
    />
    <SourceBadge source={appearance.reducedMotion.source} />
  </div>
</Section>

<StyleControls {dt} />

<Section title="Viewport preset" description="Narrows the app column. Media queries still follow the real window — use the gallery device preview for true breakpoints.">
  {#snippet actions()}<SourceBadge source={appearance.viewport.source} />{/snippet}
  <Segmented
    label="Viewport preset"
    value={appearance.viewport.value === 'custom' ? 'desktop' : appearance.viewport.value}
    options={viewports}
    busy={applying}
    onchange={(viewport: ViewportPreset) => dt.run('appearance', () => runtime.theme.setOverride({ viewport }))}
  />
</Section>

{#if showLayoutPicker}
  <Section
    title="Layout"
    description="Temporary app frame override. Share links include ?layout= when set."
  >
    {#snippet actions()}<SourceBadge source={appearance.layout.source} />{/snippet}
    <label class="block text-[11px] text-muted-foreground">
      <span class="mb-1 block">App layout</span>
      <select
        class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        aria-label="App layout"
        aria-busy={layoutApplying || undefined}
        disabled={layoutApplying}
        value={appearance.layout.value}
        onchange={(event) => setLayout((event.currentTarget as HTMLSelectElement).value as LayoutId)}
      >
        {#each layoutOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
    <InlineError message={dt.errorFor('appearance')} />
  </Section>
{/if}

<Section
  title="Shell"
  description="Presentation frame around the app (ADR-016). Always a temporary override. Share links carry ?shell= when set."
>
  {#snippet actions()}<SourceBadge source={appearance.shell.source} />{/snippet}
  <div class="mb-2.5 flex items-center justify-between gap-2">
    <Toggle
      checked={frameOn}
      label="Device frame"
      onchange={(on) => setFrame(on)}
    />
    <span class="text-[11px] text-muted-foreground">{frameOn ? 'On' : 'Off (full-bleed)'}</span>
  </div>
  <Segmented
    label="Shell"
    value={shellControlValue}
    options={primaryShells}
    busy={applying}
    onchange={(shell: Shell) => setShellPatch({ shell })}
  />
  {#if moreShells.length > 0}
    <div class="mt-2">
      <button
        type="button"
        class="inline-flex min-h-touch items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-7"
        aria-expanded={moreShellsOpen}
        onclick={() => (moreShellsOpen = !moreShellsOpen)}
      >
        More shells
        <ChevronDown
          class="size-3.5 transition-transform {moreShellsOpen ? 'rotate-180' : ''}"
          aria-hidden="true"
        />
      </button>
      {#if moreShellsOpen}
        <div class="mt-1.5 grid grid-cols-2 gap-1" role="group" aria-label="More shells">
          {#each moreShells as option (option.value)}
            {@const selected = shellControlValue === option.value}
            <button
              type="button"
              class="min-h-touch rounded-md border px-2 text-left text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-ring sm:min-h-7 {selected
                ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
              aria-pressed={selected}
              onclick={() => setShellPatch({ shell: option.value })}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if shellControlValue === 'auto' || shellControlValue !== appearance.shell.value}
    <p class="mt-1.5 text-[11px] text-muted-foreground">
      Effective shell: <span class="font-mono text-foreground">{appearance.shell.value}</span>
      {#if shellControlValue === 'auto'} (from auto){/if}
    </p>
  {/if}
</Section>

{#if appearance.shell.value !== 'none'}
  <Section
    title="Device"
    description="Catalog device the shell frames. Brand-neutral form factors only."
  >
    {#snippet actions()}<SourceBadge source={appearance.device.source} />{/snippet}
    <label class="block text-[11px] text-muted-foreground">
      <span class="mb-1 block">Device</span>
      <select
        class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Device"
        value={deviceControlValue}
        onchange={(e) =>
          setShellPatch({ device: (e.currentTarget as HTMLSelectElement).value as DeviceId })}
      >
        {#each devicesForShell as device (device.id)}
          <option value={device.id}>{device.label}</option>
        {/each}
      </select>
    </label>
  </Section>

  <Section title="Orientation" description="Portrait or landscape when the device can rotate.">
    {#snippet actions()}<SourceBadge source={appearance.orientation.source} />{/snippet}
    <Segmented
      label="Orientation"
      value={orientationValue}
      options={[
        { value: 'portrait', label: 'Portrait' },
        { value: 'landscape', label: 'Landscape' },
      ]}
      disabled={!canRotate}
      onchange={(orientation: Orientation) => setShellPatch({ orientation })}
    />
    {#if !canRotate}
      <p class="mt-1.5 text-[11px] text-muted-foreground">This device stays in landscape.</p>
    {/if}
  </Section>
{/if}

<Section title="Reset">
  <Btn disabled={!hasOverride} onclick={() => dt.run('appearance:clear', () => runtime.theme.clearOverride(), 'Appearance overrides cleared.')}>
    Clear appearance overrides
  </Btn>
</Section>
