<script lang="ts">
import { Check } from '@lucide/svelte';
import type { ColorMode, Theme, ViewportPreset } from '@protoyard/core';
import Btn from '../primitives/Btn.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import SourceBadge from '../primitives/SourceBadge.svelte';
import Toggle from '../primitives/Toggle.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const appearance = $derived(dt.appearance);
const themes = $derived<readonly Theme[]>(dt.themes.length ? dt.themes : runtime.theme.themes());

/** `override` = temporary design preview; `preference` = saved on the persona. */
let target = $state<'override' | 'preference'>('override');
const hasOverride = $derived(
  ['themeId', 'mode', 'reducedMotion', 'viewport'].some(
    (key) => dt.overrides[key as keyof typeof dt.overrides] !== undefined
  )
);

async function set(patch: { themeId?: string; mode?: ColorMode; reducedMotion?: boolean }) {
  await dt.run('appearance', () =>
    target === 'override' ? runtime.theme.setOverride(patch) : runtime.theme.setPreference(patch)
  );
}

const viewports: { value: ViewportPreset; label: string }[] = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
];
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
  <div class="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Theme">
    {#each themes as theme (theme.id)}
      {@const selected = appearance.theme.value === theme.id}
      {@const palette = appearance.resolvedMode === 'dark' ? theme.dark : theme.light}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        title={theme.description}
        class="group flex min-h-touch flex-col items-start gap-1.5 rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-ring {selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:bg-muted/60'}"
        onclick={() => set({ themeId: theme.id })}
      >
        <span class="flex w-full overflow-hidden rounded" style:background-color={palette.background} aria-hidden="true">
          <span class="h-5 flex-1" style:background-color={palette.primary}></span>
          <span class="h-5 flex-1" style:background-color={palette.accent}></span>
          <span class="h-5 flex-1" style:background-color={palette.surface}></span>
          <span class="h-5 flex-1" style:background-color={palette.foreground}></span>
        </span>
        <span class="flex w-full items-center justify-between text-[11px] font-medium">
          {theme.name}
          {#if selected}<Check class="size-3 text-primary" aria-hidden="true" />{/if}
        </span>
      </button>
    {/each}
  </div>
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

<Section title="Viewport preset" description="Narrows the app column. Media queries still follow the real window — use the gallery device preview for true breakpoints.">
  {#snippet actions()}<SourceBadge source={appearance.viewport.source} />{/snippet}
  <Segmented
    label="Viewport preset"
    value={appearance.viewport.value === 'custom' ? 'desktop' : appearance.viewport.value}
    options={viewports}
    onchange={(viewport: ViewportPreset) => dt.run('appearance', () => runtime.theme.setOverride({ viewport }))}
  />
</Section>

<Section title="Reset">
  <Btn disabled={!hasOverride} onclick={() => dt.run('appearance:clear', () => runtime.theme.clearOverride(), 'Appearance overrides cleared.')}>
    Clear appearance overrides
  </Btn>
</Section>
