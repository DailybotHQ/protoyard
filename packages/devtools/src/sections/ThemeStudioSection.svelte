<script lang="ts">
import {
  type ElevationStyle,
  FOCUS_RING_STYLES,
  type FocusRingStyle,
  SURFACE_STYLES,
  type SurfaceStyle,
  type Theme,
  type ThemeController,
  type ThemeInput,
} from '@protoyard/core';
import {
  applyAppearance,
  BUILTIN_THEMES,
  clearAppearance,
  contrastRatio,
  createThemeFromSeed,
  decodeThemeShare,
  ELEVATION_PRESETS,
  FONT_CATALOG,
  generateThemeHarmonies,
  getThemeShareValue,
  type LibraryThemeDefinition,
  MOTION_PRESETS,
  type MotionPresetId,
  NEUTRAL_FAMILIES,
  type NeutralFamily,
  parseHex,
  RADIUS_PRESETS,
  type RadiusPresetId,
  stylePresetInput,
  TEXT_CONTRAST_PAIRS,
  type ThemeShareDefinition,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import {
  loadLibraryTheme,
  loadLibraryThemeDefinition,
  THEME_LIBRARY_META,
} from '@protoyard/themes/library';
import { onMount, untrack } from 'svelte';
import { Checkbox } from 'texuli/choice';
import { Input, Textarea } from 'texuli/input';
import { Slider } from 'texuli/slider';
import { copyText } from '../format.ts';
import { themeShareLink } from '../link.ts';
import Btn from '../primitives/Btn.svelte';
import FileInput from '../primitives/FileInput.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import SelectField from '../primitives/SelectField.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

/**
 * Theme Studio: builds a complete light/dark theme from a seed color and a
 * few style choices, previews it in a scoped box, warns about contrast, and
 * saves it as a custom theme in this prototype's control database. Loaded
 * lazily by the Appearance section, so it never ships in production builds.
 */

/** What `@protoyard/runtime` adds to the theme controller for custom themes. */
interface CustomThemeApi {
  customThemes(): readonly Theme[];
  saveCustom(input: ThemeInput): Promise<Theme>;
  removeCustom(id: string): Promise<void>;
  exportTheme(id: string): string;
  importTheme(json: string): Promise<Theme>;
}

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const api = $derived(
  typeof (runtime.theme as Partial<CustomThemeApi>).saveCustom === 'function'
    ? (runtime.theme as ThemeController & CustomThemeApi)
    : null
);

let name = $state('My theme');
let seed = $state('#7c3aed');
let useSecondary = $state(false);
let secondary = $state('#0ea5e9');
let neutral = $state<NeutralFamily>('tinted');
let startFrom = $state('');
let loadingStart = $state(false);
let startError = $state<string | null>(null);
let fontId = $state<string>(FONT_CATALOG[0]?.id ?? 'system');
let radius = $state<RadiusPresetId>('default');
let radiusOverride = $state<string | undefined>(undefined);
let radiusChanged = $state(false);
let inheritedStyle = $state<ThemeInput['style']>(undefined);
let elevation = $state<ElevationStyle>('soft');
let density = $state(1);
let motion = $state<MotionPresetId>('standard');
let motionChanged = $state(false);
let surface = $state<SurfaceStyle>('solid');
let focusRing = $state<FocusRingStyle>('ring');
// Starts in the app's current mode; afterwards it is the Studio's own toggle.
let previewMode = $state<'light' | 'dark'>(untrack(() => dt.appearance.resolvedMode));
let importText = $state('');
let importError = $state<string | null>(null);
let exported = $state<{ id: string; json: string } | null>(null);
let sharedDraftPending = $state(false);
let sharedLink = $state('');
let shareError = $state<string | null>(null);
let sharing = $state(false);
/** Bumped after saves/removals so the saved list re-reads the runtime. */
let revision = $state(0);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

onMount(() => {
  const value = getThemeShareValue(location.search, location.hash);
  if (!value) return;
  try {
    const definition = decodeThemeShare(value);
    name = definition.name;
    seed = definition.seed;
    secondary = definition.secondary ?? '#0ea5e9';
    useSecondary = definition.secondary !== undefined;
    neutral = definition.neutral;
    fontId = definition.font;
    radius = definition.radius;
    radiusOverride = undefined;
    radiusChanged = true;
    inheritedStyle = undefined;
    elevation = definition.elevation;
    density = definition.density;
    motion = definition.motion;
    motionChanged = true;
    surface = definition.surface;
    focusRing = definition.focusRing;
    sharedDraftPending = true;
  } catch (error) {
    shareError = error instanceof Error ? error.message : String(error);
  }
});

const harmonies = $derived.by(() => {
  if (!HEX.test(seed)) return [];
  try {
    return generateThemeHarmonies(seed, neutral);
  } catch {
    return [];
  }
});

function closestRadius(value: string | undefined): RadiusPresetId {
  return RADIUS_PRESETS.find((preset) => preset.radius === value)?.id ?? 'default';
}

function applyThemeStart(theme: Theme, definition?: LibraryThemeDefinition) {
  name = theme.name;
  seed = definition?.seed ?? theme.light.primary;
  secondary = definition?.secondary ?? theme.light.secondary;
  useSecondary = true;
  neutral = definition?.neutral ?? 'tinted';
  const font =
    FONT_CATALOG.find((option) => option.id === definition?.font) ??
    FONT_CATALOG.find((option) => option.fontFamily === theme.fontFamily);
  if (font) fontId = font.id;
  radius = closestRadius(definition?.radius ?? theme.radius);
  radiusOverride = definition?.radius ?? theme.radius;
  radiusChanged = false;
  inheritedStyle = definition?.style ?? theme.style;
  motionChanged = false;
  motion = 'standard';
  density = definition?.density ?? theme.density ?? 1;
  elevation = definition?.style?.elevation ?? theme.style?.elevation ?? 'soft';
  surface = definition?.style?.surface ?? theme.style?.surface ?? 'solid';
  focusRing = definition?.style?.focusRing?.style ?? theme.style?.focusRing?.style ?? 'ring';
}

async function loadStartTheme() {
  if (!startFrom) return;
  loadingStart = true;
  startError = null;
  try {
    if (startFrom.startsWith('library:')) {
      const id = startFrom.slice('library:'.length);
      const [theme, definition] = await Promise.all([
        loadLibraryTheme(id),
        loadLibraryThemeDefinition(id),
      ]);
      applyThemeStart(theme, definition);
    } else {
      const id = startFrom.slice('builtin:'.length);
      const theme = BUILTIN_THEMES.find((candidate) => candidate.id === id);
      if (theme) applyThemeStart(theme);
    }
  } catch (error) {
    startError = error instanceof Error ? error.message : String(error);
  } finally {
    loadingStart = false;
  }
}

function slug(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(base) ? base.slice(0, 40) : `custom-${base}`.replace(/-$/, '').slice(0, 40);
}

const draft = $derived.by((): { theme: Theme } | { error: string } => {
  if (!name.trim()) return { error: 'Give the theme a name.' };
  if (!HEX.test(seed)) return { error: 'The seed color must be a hex color like #7c3aed.' };
  if (useSecondary && !HEX.test(secondary)) {
    return { error: 'The secondary color must be a hex color like #0ea5e9.' };
  }
  const font = FONT_CATALOG.find((f) => f.id === fontId) ?? FONT_CATALOG[0];
  // Radius and motion come from the shared style presets (`@protoyard/themes`).
  const presets = stylePresetInput({ radius, motion });
  try {
    const generated = createThemeFromSeed({
      id: slug(name),
      name: name.trim().slice(0, 40),
      seed,
      ...(useSecondary ? { secondary } : {}),
      neutral,
      style: {
        ...inheritedStyle,
        ...presets.style,
        motion: motionChanged
          ? presets.style.motion
          : (inheritedStyle?.motion ?? presets.style.motion),
        ...(inheritedStyle?.shape || presets.style.shape
          ? {
              shape: {
                ...inheritedStyle?.shape,
                ...presets.style.shape,
                ...(!radiusChanged && inheritedStyle?.shape?.radiusScale !== undefined
                  ? { radiusScale: inheritedStyle.shape.radiusScale }
                  : {}),
              },
            }
          : {}),
        elevation,
        surface,
        focusRing: { style: focusRing },
      } as NonNullable<ThemeInput['style']>,
    });
    return {
      theme: {
        ...generated,
        radius: radiusOverride ?? presets.radius ?? generated.radius,
        density,
        ...(font
          ? {
              fontFamily: font.fontFamily,
              fontFamilyHeading: font.fontFamilyHeading,
              fontFamilyMono: font.fontFamilyMono,
            }
          : {}),
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});

/** Text pairs need 4.5:1, focus ring pairs 3:1 (WCAG AA). Non-hex values are skipped. */
const warnings = $derived.by(() => {
  if (!('theme' in draft)) return [];
  const out: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const palette = draft.theme[mode];
    const check = (pairs: readonly (readonly [string, string])[], minimum: number) => {
      for (const [fg, bg] of pairs) {
        const a = palette[fg as keyof typeof palette];
        const b = palette[bg as keyof typeof palette];
        if (!parseHex(a) || !parseHex(b)) continue;
        const ratio = contrastRatio(a, b);
        if (ratio < minimum) {
          out.push(`${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`);
        }
      }
    };
    check(TEXT_CONTRAST_PAIRS, 4.5);
    check(UI_CONTRAST_PAIRS, 3);
  }
  return out;
});

const saved = $derived.by(() => {
  void revision;
  void dt.appearance;
  return api ? [...api.customThemes()] : [];
});

/** Applies the draft to the preview box only (scoped CSS variables). */
function preview(node: HTMLElement) {
  $effect(() => {
    if ('theme' in draft) {
      applyAppearance(node, { theme: draft.theme, resolvedMode: previewMode });
    }
  });
  return () => clearAppearance(node);
}

async function save(andUse: boolean) {
  if (!api || !('theme' in draft)) return;
  const theme = draft.theme;
  const result = await dt.run(
    'theme-studio',
    async () => {
      const stored = await api.saveCustom(theme);
      if (andUse) await runtime.theme.setOverride({ themeId: stored.id });
      return stored;
    },
    andUse ? `Saved and previewing “${theme.name}”` : `Saved “${theme.name}”`
  );
  if (result) {
    revision++;
    sharedDraftPending = false;
  }
}

function shareDefinition(): ThemeShareDefinition {
  return {
    name: name.trim().slice(0, 40),
    seed,
    ...(useSecondary ? { secondary } : {}),
    neutral,
    font: fontId,
    radius,
    elevation,
    motion,
    surface,
    focusRing,
    density,
  };
}

async function copyShareLink() {
  sharing = true;
  shareError = null;
  try {
    sharedLink = themeShareLink(runtime, shareDefinition());
    const copied = await copyText(sharedLink);
    dt.notify(
      'success',
      copied ? 'Theme share link copied.' : 'Theme share link is ready to copy.'
    );
  } catch (error) {
    shareError = error instanceof Error ? error.message : String(error);
  } finally {
    sharing = false;
  }
}

async function remove(theme: Theme) {
  if (!api) return;
  await dt.run('theme-studio', () => api.removeCustom(theme.id), `Deleted “${theme.name}”`);
  if (exported?.id === theme.id) exported = null;
  revision++;
}

function exportTheme(theme: Theme) {
  if (!api) return;
  const response = JSON.parse(api.exportTheme(theme.id)) as {
    format?: string;
    theme?: Theme;
  };
  const bareTheme = response.format === 'protoyard-theme/v1' ? response.theme : undefined;
  if (!bareTheme) throw new TypeError('Theme export did not contain a valid theme.');
  exported = { id: theme.id, json: JSON.stringify(bareTheme, null, 2) };
}

const downloadHref = $derived(
  exported ? `data:application/json;charset=utf-8,${encodeURIComponent(exported.json)}` : null
);

async function importTheme() {
  if (!api) return;
  importError = null;
  try {
    const theme = await api.importTheme(importText);
    importText = '';
    revision++;
    dt.notify('success', `Imported “${theme.name}”`);
  } catch (error) {
    const issues = (error as { issues?: Record<string, string> }).issues;
    importError = issues
      ? Object.entries(issues)
          .map(([field, message]) => (field === 'form' ? message : `${field}: ${message}`))
          .join(' · ')
      : error instanceof Error
        ? error.message
        : String(error);
  }
}

/** Same 64 KB cap as `MAX_THEME_JSON_BYTES` in `@protoyard/runtime`, checked before reading. */
const MAX_THEME_FILE_BYTES = 64 * 1024;

async function importFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_THEME_FILE_BYTES) {
    // Refuse before `file.text()`: a huge file would otherwise be read into memory first.
    importError = `That file is too large for a theme (limit ${MAX_THEME_FILE_BYTES / 1024} KB).`;
    input.value = '';
    return;
  }
  importText = await file.text();
  await importTheme();
}

const inputClass =
  'min-h-touch w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-7';
</script>

{#if !api}
  <Section title="Theme Studio">
    <p class="text-xs text-muted-foreground">This runtime does not support custom themes.</p>
  </Section>
{:else}
  <Section title="Theme Studio" description="Build a theme from a brand color. Saved themes stay in this prototype's control database.">
    <div class="grid gap-2.5" data-testid="theme-studio">
      <div class="grid grid-cols-[1fr_auto] items-end gap-2">
        <label class="grid gap-1 text-[11px] text-muted-foreground">
          Start from a theme
          <SelectField
            class={inputClass}
            value={startFrom}
            label="Start from a theme"
            onchange={(value) => { startFrom = value; }}
            options={[
              { value: '', label: 'Choose a built-in or library theme' },
              ...BUILTIN_THEMES.map((theme) => ({ value: `builtin:${theme.id}`, label: `Built-in · ${theme.name}` })),
              ...THEME_LIBRARY_META.map((theme) => ({ value: `library:${theme.id}`, label: `Library · ${theme.name}` })),
            ]}
          />
        </label>
        <Btn busy={loadingStart} disabled={!startFrom} onclick={loadStartTheme}>Load</Btn>
      </div>
      {#if startError}<p class="text-xs text-destructive" role="alert">{startError}</p>{/if}
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Name
        <Input class={inputClass} bind:value={name} maxlength={40} aria-label="Theme name" />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <div class="grid gap-1 text-[11px] text-muted-foreground">
          <span>Seed color</span>
          <span class="flex items-center gap-1.5">
            <Input type="color" class="size-7 shrink-0 rounded border border-border bg-transparent" bind:value={seed} aria-label="Seed color picker" />
            <Input class={inputClass} bind:value={seed} aria-label="Seed color" spellcheck="false" />
          </span>
        </div>
        <div class="grid gap-1 text-[11px] text-muted-foreground">
          <label class="flex items-center gap-1.5">
          <Checkbox bind:checked={useSecondary} aria-label="Use a secondary color" />
            Use a secondary color
          </label>
          <span class="flex items-center gap-1.5">
            <Input type="color" class="size-7 shrink-0 rounded border border-border bg-transparent" bind:value={secondary} disabled={!useSecondary} aria-label="Secondary color picker" />
            <Input class={inputClass} bind:value={secondary} disabled={!useSecondary} aria-label="Secondary color" spellcheck="false" />
          </span>
        </div>
      </div>
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Neutral family
        <SelectField
          class={inputClass}
          bind:value={neutral}
          label="Neutral family"
          options={NEUTRAL_FAMILIES.map((family) => ({ value: family, label: `${family[0]?.toUpperCase()}${family.slice(1)}` }))}
        />
      </label>
      <fieldset class="grid gap-1.5" aria-label="Color harmony suggestions">
        <legend class="text-[11px] text-muted-foreground">Suggested secondary colors</legend>
        <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {#each harmonies as suggestion (suggestion.id)}
            <Btn
              type="button"
              class="grid min-h-touch gap-1 rounded-md border border-border p-1.5 text-left text-[10px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Use ${suggestion.label} harmony`}
              aria-pressed={useSecondary && secondary === suggestion.secondary}
              onclick={() => { secondary = suggestion.secondary; useSecondary = true; }}
            >
              <span>{suggestion.label}</span>
              <span class="flex h-4 overflow-hidden rounded" aria-hidden="true">
                <span class="flex-1" style:background-color={suggestion.theme.light.primary}></span>
                <span class="flex-1" style:background-color={suggestion.theme.light.secondary}></span>
              </span>
            </Btn>
          {/each}
        </div>
      </fieldset>
      <div class="grid grid-cols-2 gap-2">
        <label class="grid gap-1 text-[11px] text-muted-foreground">
          Font pairing
          <SelectField
            class={inputClass}
            bind:value={fontId}
            label="Font pairing"
            options={FONT_CATALOG.map((font) => ({ value: font.id, label: font.label }))}
          />
        </label>
        <label class="grid gap-1 text-[11px] text-muted-foreground">
          Corner radius
          <SelectField
            class={inputClass}
            bind:value={radius}
            label="Corner radius"
            onchange={() => { radiusOverride = undefined; radiusChanged = true; }}
            options={RADIUS_PRESETS.map((option) => ({ value: option.id, label: option.label }))}
          />
        </label>
      </div>
      <div class="grid gap-1 text-[11px] text-muted-foreground">
        Elevation
        <Segmented
          label="Elevation"
          value={elevation}
          options={ELEVATION_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
          onchange={(value) => (elevation = value)}
        />
      </div>
      <div class="grid gap-1 text-[11px] text-muted-foreground">
        Surface
        <Segmented
          label="Surface"
          value={surface}
          options={SURFACE_STYLES.map((value) => ({ value, label: value === 'glass' ? 'Glass' : 'Solid' }))}
          onchange={(value) => (surface = value)}
        />
      </div>
      <div class="grid gap-1 text-[11px] text-muted-foreground">
        Motion
        <Segmented
          label="Motion"
          value={motion}
          options={MOTION_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
          onchange={(value: MotionPresetId) => { motion = value; motionChanged = true; }}
        />
      </div>
      <div class="grid gap-1 text-[11px] text-muted-foreground">
        Focus ring
        <Segmented
          label="Focus ring"
          value={focusRing}
          options={FOCUS_RING_STYLES.map((value) => ({ value, label: value[0]?.toUpperCase() + value.slice(1) }))}
          onchange={(value) => (focusRing = value)}
        />
      </div>
      <label class="block text-[11px] text-muted-foreground">
        <span class="flex justify-between"><span>Density</span><span class="font-mono text-foreground">{density}×</span></span>
        <Slider
          min={0.75}
          max={1.25}
          step={0.125}
          class="mt-1 w-full"
          bind:value={density}
          label="Theme density"
          aria-label="Theme density"
          getValueText={(value) => `${value} times`}
        />
      </label>
    </div>
  </Section>

  <Section title="Preview">
    {#snippet actions()}
      <Segmented
        label="Preview mode"
        value={previewMode}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onchange={(value) => (previewMode = value)}
      />
    {/snippet}
    {#if 'error' in draft}
      <p class="text-xs text-destructive" role="alert">{draft.error}</p>
    {:else}
      <div
        {@attach preview}
        data-testid="theme-studio-preview"
        class="grid gap-2 rounded-lg border border-border bg-background p-3 text-foreground"
        style:font-family="var(--tx-font-sans)"
      >
        <p class="text-sm font-semibold" style:font-family="var(--tx-font-heading)">{draft.theme.name}</p>
        <div class="rounded-md border border-border bg-surface p-2.5 text-surface-foreground shadow-sm">
          <p class="text-xs">A card on the surface color.</p>
          <p class="text-[11px] text-muted-foreground">Muted supporting text.</p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span class="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground" style:border-radius="var(--tx-radius)">Primary</span>
          <span class="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground" style:border-radius="var(--tx-radius)">Secondary</span>
          <span class="inline-flex items-center rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground">Delete</span>
          <span class="inline-flex items-center rounded-full bg-success px-2 py-0.5 text-[11px] text-success-foreground">Success</span>
        </div>
        <div class="h-7 rounded-md border border-input bg-background px-2 text-[11px] leading-7 text-muted-foreground">Input placeholder</div>
      </div>
      {#if warnings.length > 0}
        <ul class="mt-2 grid gap-0.5 text-[11px] text-warning" role="status" aria-label="Contrast warnings">
          {#each warnings as warning (warning)}<li>⚠ {warning}</li>{/each}
        </ul>
      {:else}
        <p class="mt-2 text-[11px] text-success" role="status">All text and focus pairs meet WCAG AA in light and dark.</p>
      {/if}
      {#if sharedDraftPending}
        <div class="grid gap-1.5 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs" role="status">
          <p>This shared theme is a draft. Save it to this browser?</p>
          <div class="flex gap-1.5">
            <Btn busy={dt.isBusy('theme-studio')} onclick={() => save(false)}>Save shared draft</Btn>
            <Btn variant="ghost" onclick={() => (sharedDraftPending = false)}>Keep editing</Btn>
          </div>
        </div>
      {/if}
      {#if shareError}<p class="text-xs text-destructive" role="alert">{shareError}</p>{/if}
      <div class="mt-2.5 flex flex-wrap gap-1.5">
        {#if !sharedDraftPending}
          <Btn variant="primary" busy={dt.isBusy('theme-studio')} onclick={() => save(true)}>Save and preview</Btn>
          <Btn busy={dt.isBusy('theme-studio')} onclick={() => save(false)}>Save</Btn>
        {/if}
        <Btn busy={sharing} disabled={!('theme' in draft)} onclick={copyShareLink}>Copy draft share link</Btn>
      </div>
      {#if sharedLink}<Textarea class="{inputClass} mt-1 h-16 font-mono" readonly value={sharedLink} aria-label="Theme share link" />{/if}
      <p class="mt-1 text-[11px] text-muted-foreground">Saved as <code class="font-mono">{draft.theme.id}</code>. Saving again with the same name replaces it.</p>
    {/if}
  </Section>

  <Section title="Custom themes" description="Pick them in the theme grid above. Export shares a JSON file; import validates it first.">
    {#if saved.length === 0}
      <p class="text-xs text-muted-foreground">No custom themes yet.</p>
    {:else}
      <ul class="grid gap-1.5" aria-label="Saved custom themes">
        {#each saved as theme (theme.id)}
          <li class="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="size-3 shrink-0 rounded-full" style:background-color={theme.light.primary} aria-hidden="true"></span>
              <span class="truncate">{theme.name}</span>
            </span>
            <span class="flex shrink-0 gap-1">
              <Btn variant="ghost" onclick={() => exportTheme(theme)} aria-label={`Export ${theme.name}`}>Export</Btn>
              <Btn variant="ghost" onclick={() => remove(theme)} aria-label={`Delete ${theme.name}`}>Delete</Btn>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if exported && downloadHref}
      <div class="mt-2 grid gap-1">
        <Textarea class="{inputClass} h-24 font-mono" readonly value={exported.json} aria-label="Exported theme JSON" />
        <a class="text-[11px] font-medium text-primary underline" href={downloadHref} download={`${exported.id}.theme.json`}>Download {exported.id}.theme.json</a>
      </div>
    {/if}
    <div class="mt-3 grid gap-1.5">
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Import theme JSON
        <Textarea class="{inputClass} h-20 font-mono" bind:value={importText} aria-label="Theme JSON to import" spellcheck="false"></Textarea>
      </label>
      <div class="flex flex-wrap items-center gap-1.5">
        <Btn onclick={importTheme} disabled={!importText.trim()}>Import</Btn>
        <label class="text-[11px] text-muted-foreground">
          or a file
          <FileInput accept="application/json,.json" class="text-[11px]" onchange={importFile} label="Theme file to import" />
        </label>
      </div>
      {#if importError}<p class="text-[11px] text-destructive" role="alert">{importError}</p>{/if}
    </div>
  </Section>
{/if}
