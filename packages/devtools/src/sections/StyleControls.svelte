<script lang="ts">
import {
  DENSITY_PRESETS,
  ELEVATION_PRESETS,
  FONT_PRESETS,
  MOTION_PRESETS,
  RADIUS_PRESETS,
} from '@protoyard/themes';
import { Slider } from 'texuli/slider';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import SelectField from '../primitives/SelectField.svelte';
import SourceBadge from '../primitives/SourceBadge.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

/**
 * Shape, type and motion on top of the active theme: density, corner radius,
 * elevation, font pairing and motion presets (`@protoyard/themes`
 * style-presets). Every choice is a temporary override, like density and the
 * viewport; "Theme" clears that one override so the theme's own value
 * returns. Each control has its own busy key.
 */

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const appearance = $derived(dt.appearance);
const applying = $derived(dt.isBusy('appearance'));

/** The segmented value that means "no override: use the theme's own". */
const THEME = 'theme';
type Patch = Parameters<typeof runtime.theme.setOverride>[0];

async function apply(key: string, patch: Patch) {
  await dt.run(`appearance:style:${key}`, () => runtime.theme.setOverride(patch));
  return dt.errorFor('appearance') === null;
}

const withTheme = (presets: readonly { id: string; label: string }[]) => [
  { value: THEME, label: 'Theme' },
  ...presets.map((preset) => ({ value: preset.id, label: preset.label })),
];

const density = $derived(appearance.density?.value ?? 1);
let densityDraft = $state(1);
$effect(() => {
  densityDraft = density;
});
let queuedDensity: number | undefined;
let savingDensity = false;
async function commitDensity(value: number) {
  queuedDensity = value;
  if (savingDensity) return;
  savingDensity = true;
  try {
    while (queuedDensity !== undefined) {
      while (applying) await new Promise((resolve) => setTimeout(resolve, 0));
      const next = queuedDensity;
      queuedDensity = undefined;
      if (!(await apply('density', { density: next }))) densityDraft = density;
    }
  } finally {
    savingDensity = false;
    if (queuedDensity !== undefined) void commitDensity(queuedDensity);
  }
}
/** The density preset that matches the current value, if any. */
const densityPreset = $derived(
  appearance.density?.source === 'override'
    ? (DENSITY_PRESETS.find((preset) => preset.density === density)?.id ?? 'custom')
    : THEME
);
const formatDensity = (value: number) =>
  `${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}×`;
</script>

<Section title="Density" description="Scales the whole spacing system. Always a temporary override.">
  {#snippet actions()}{#if appearance.density}<SourceBadge source={appearance.density.source} />{/if}{/snippet}
  <div class="grid gap-2">
    <Segmented
      label="Density preset"
      value={densityPreset}
      options={withTheme(DENSITY_PRESETS)}
      busy={applying}
      onchange={(value: string) => {
        const preset = DENSITY_PRESETS.find((entry) => entry.id === value);
        apply('density', { density: preset?.density });
      }}
    />
    <label class="block text-[11px] text-muted-foreground">
      <span class="flex justify-between"><span>Fine tune</span><span class="font-mono text-foreground">{formatDensity(densityDraft)}</span></span>
      <Slider
        min={0.75}
        max={1.25}
        step={0.025}
        class="mt-1 w-full accent-primary"
        value={densityDraft}
        label="Density"
        aria-label="Density"
        getValueText={(value) => `${value} times`}
        onValueChange={(value) => {
          if (typeof value === 'number') densityDraft = value;
        }}
        onValueCommit={(value) => {
          if (typeof value === 'number') void commitDensity(value);
        }}
      />
    </label>
  </div>
</Section>

<Section title="Corner radius" description="Rounds buttons, cards and inputs. A temporary override on top of the theme.">
  {#snippet actions()}{#if appearance.radius}<SourceBadge source={appearance.radius.source} />{/if}{/snippet}
  <Segmented
    label="Corner radius"
    value={appearance.radius?.value ?? THEME}
    options={withTheme(RADIUS_PRESETS)}
    busy={applying}
    onchange={(value: string) =>
      apply('radius', { radius: value === THEME ? undefined : (value as Patch['radius']) })}
  />
</Section>

<Section title="Elevation" description="Shadow character: flat, soft, crisp, glow or layered.">
  {#snippet actions()}{#if appearance.elevation}<SourceBadge source={appearance.elevation.source} />{/if}{/snippet}
  <Segmented
    label="Elevation"
    value={appearance.elevation?.value ?? THEME}
    options={withTheme(ELEVATION_PRESETS)}
    busy={applying}
    onchange={(value: string) =>
      apply('elevation', {
        elevation: value === THEME ? undefined : (value as Patch['elevation']),
      })}
  />
</Section>

<Section title="Font pairing" description="System-first font stacks; nothing is downloaded.">
  {#snippet actions()}{#if appearance.font}<SourceBadge source={appearance.font.source} />{/if}{/snippet}
  <SelectField
    class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60"
    label="Font pairing"
    value={appearance.font?.value ?? THEME}
    disabled={applying}
    onchange={(value) => {
      apply('font', { font: value === THEME ? undefined : (value as Patch['font']) });
    }}
    options={[{ value: THEME, label: 'Theme' }, ...FONT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))]}
  />
</Section>

<Section title="Motion" description="Transition speed and easing. Reduced motion still wins.">
  {#snippet actions()}{#if appearance.motion}<SourceBadge source={appearance.motion.source} />{/if}{/snippet}
  <Segmented
    label="Motion"
    value={appearance.motion?.value ?? THEME}
    options={withTheme(MOTION_PRESETS)}
    busy={applying}
    onchange={(value: string) =>
      apply('motion', { motion: value === THEME ? undefined : (value as Patch['motion']) })}
  />
</Section>
