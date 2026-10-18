<script lang="ts">
import {
  ELEVATION_STYLES,
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
  clearAppearance,
  contrastRatio,
  createThemeFromSeed,
  FONT_CATALOG,
  parseHex,
  TEXT_CONTRAST_PAIRS,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import { untrack } from 'svelte';
import Btn from '../primitives/Btn.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
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

const RADII = [
  { value: '0', label: 'Square' },
  { value: '0.25rem', label: 'Small' },
  { value: '0.5rem', label: 'Medium' },
  { value: '0.625rem', label: 'Default' },
  { value: '0.875rem', label: 'Large' },
  { value: '1.25rem', label: 'XL' },
  { value: '9999px', label: 'Pill' },
] as const;

type MotionPreset = 'none' | 'subtle' | 'standard' | 'expressive';
const MOTION: Record<MotionPreset, { fast: number; base: number; slow: number; easing: string }> = {
  none: { fast: 0, base: 0, slow: 0, easing: 'linear' },
  subtle: { fast: 100, base: 150, slow: 200, easing: 'ease-out' },
  standard: { fast: 150, base: 200, slow: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  expressive: { fast: 200, base: 300, slow: 500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
};

let name = $state('My theme');
let seed = $state('#7c3aed');
let useSecondary = $state(false);
let secondary = $state('#0ea5e9');
let fontId = $state<string>(FONT_CATALOG[0]?.id ?? 'system');
let radius = $state<string>('0.625rem');
let elevation = $state<ElevationStyle>('soft');
let density = $state(1);
let motion = $state<MotionPreset>('standard');
let surface = $state<SurfaceStyle>('solid');
let focusRing = $state<FocusRingStyle>('ring');
// Starts in the app's current mode; afterwards it is the Studio's own toggle.
let previewMode = $state<'light' | 'dark'>(untrack(() => dt.appearance.resolvedMode));
let importText = $state('');
let importError = $state<string | null>(null);
let exported = $state<{ id: string; json: string } | null>(null);
/** Bumped after saves/removals so the saved list re-reads the runtime. */
let revision = $state(0);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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
  const m = MOTION[motion];
  try {
    const generated = createThemeFromSeed({
      id: slug(name),
      name: name.trim().slice(0, 40),
      seed,
      ...(useSecondary ? { secondary } : {}),
      style: {
        elevation,
        surface,
        motion: { durations: { fast: m.fast, base: m.base, slow: m.slow }, easing: m.easing },
        focusRing: { style: focusRing },
      },
    });
    return {
      theme: {
        ...generated,
        radius,
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
  if (result) revision++;
}

async function remove(theme: Theme) {
  if (!api) return;
  await dt.run('theme-studio', () => api.removeCustom(theme.id), `Deleted “${theme.name}”`);
  if (exported?.id === theme.id) exported = null;
  revision++;
}

function exportTheme(theme: Theme) {
  if (!api) return;
  exported = { id: theme.id, json: api.exportTheme(theme.id) };
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

async function importFile(event: Event) {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
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
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Name
        <input class={inputClass} bind:value={name} maxlength="40" aria-label="Theme name" />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <div class="grid gap-1 text-[11px] text-muted-foreground">
          <span>Seed color</span>
          <span class="flex items-center gap-1.5">
            <input type="color" class="size-7 shrink-0 rounded border border-border bg-transparent" bind:value={seed} aria-label="Seed color picker" />
            <input class={inputClass} bind:value={seed} aria-label="Seed color" spellcheck="false" />
          </span>
        </div>
        <div class="grid gap-1 text-[11px] text-muted-foreground">
          <label class="flex items-center gap-1.5">
            <input type="checkbox" bind:checked={useSecondary} />
            Use a secondary color
          </label>
          <span class="flex items-center gap-1.5">
            <input type="color" class="size-7 shrink-0 rounded border border-border bg-transparent" bind:value={secondary} disabled={!useSecondary} aria-label="Secondary color picker" />
            <input class={inputClass} bind:value={secondary} disabled={!useSecondary} aria-label="Secondary color" spellcheck="false" />
          </span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="grid gap-1 text-[11px] text-muted-foreground">
          Font pairing
          <select class={inputClass} bind:value={fontId} aria-label="Font pairing">
            {#each FONT_CATALOG as font (font.id)}
              <option value={font.id}>{font.label}</option>
            {/each}
          </select>
        </label>
        <label class="grid gap-1 text-[11px] text-muted-foreground">
          Corner radius
          <select class={inputClass} bind:value={radius} aria-label="Corner radius">
            {#each RADII as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="grid gap-1 text-[11px] text-muted-foreground">
        Elevation
        <Segmented
          label="Elevation"
          value={elevation}
          options={ELEVATION_STYLES.map((value) => ({ value, label: value[0]?.toUpperCase() + value.slice(1) }))}
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
          options={[
            { value: 'none', label: 'None' },
            { value: 'subtle', label: 'Subtle' },
            { value: 'standard', label: 'Standard' },
            { value: 'expressive', label: 'Expressive' },
          ]}
          onchange={(value: MotionPreset) => (motion = value)}
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
        <input type="range" min="0.75" max="1.25" step="0.125" class="mt-1 w-full accent-primary" bind:value={density} aria-label="Theme density" />
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
        style:font-family="var(--py-font-sans)"
      >
        <p class="text-sm font-semibold" style:font-family="var(--py-font-heading)">{draft.theme.name}</p>
        <div class="rounded-md border border-border bg-surface p-2.5 text-surface-foreground shadow-sm">
          <p class="text-xs">A card on the surface color.</p>
          <p class="text-[11px] text-muted-foreground">Muted supporting text.</p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span class="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground" style:border-radius="var(--py-radius)">Primary</span>
          <span class="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground" style:border-radius="var(--py-radius)">Secondary</span>
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
      <div class="mt-2.5 flex flex-wrap gap-1.5">
        <Btn variant="primary" busy={dt.isBusy('theme-studio')} onclick={() => save(true)}>Save and preview</Btn>
        <Btn busy={dt.isBusy('theme-studio')} onclick={() => save(false)}>Save</Btn>
      </div>
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
        <textarea class="{inputClass} h-24 font-mono" readonly aria-label="Exported theme JSON">{exported.json}</textarea>
        <a class="text-[11px] font-medium text-primary underline" href={downloadHref} download={`${exported.id}.theme.json`}>Download {exported.id}.theme.json</a>
      </div>
    {/if}
    <div class="mt-3 grid gap-1.5">
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Import theme JSON
        <textarea class="{inputClass} h-20 font-mono" bind:value={importText} aria-label="Theme JSON to import" spellcheck="false"></textarea>
      </label>
      <div class="flex flex-wrap items-center gap-1.5">
        <Btn onclick={importTheme} disabled={!importText.trim()}>Import</Btn>
        <label class="text-[11px] text-muted-foreground">
          or a file
          <input type="file" accept="application/json,.json" class="text-[11px]" onchange={importFile} aria-label="Theme file to import" />
        </label>
      </div>
      {#if importError}<p class="text-[11px] text-destructive" role="alert">{importError}</p>{/if}
    </div>
  </Section>
{/if}
