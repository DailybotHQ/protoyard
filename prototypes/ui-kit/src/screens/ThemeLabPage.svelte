<script lang="ts">
import { type Theme, type ThemePalette, tokenToCssVar } from '@protoyard/core';
import { getRuntime, runService, useAppearance } from '@protoyard/renderer-svelte';
import type { ThemeControllerExtras } from '@protoyard/runtime';
import {
  BUILTIN_THEMES,
  contrastRatio,
  createThemeFromSeed,
  FONT_CATALOG,
  loadLibraryTheme,
  parseHex,
  TEXT_CONTRAST_PAIRS,
  THEME_LIBRARY_META,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import { Badge, Button } from '@protoyard/ui';
import ThemePreview from '../components/ThemePreview.svelte';
import { themeLabService } from '../lib/services.ts';
import {
  ALL_THEME_CATEGORIES,
  activateTheme,
  exportThemeJson,
  filterLibraryThemes,
  listThemeCategories,
} from '../lib/theme-lab.ts';

const runtime = getRuntime();
const appearance = useAppearance();
const themeExtras = runtime.theme as typeof runtime.theme & ThemeControllerExtras;
const themeServices = themeLabService();
let selectedId = $state(appearance.current.theme.value);
let tableMode = $state<'light' | 'dark'>(appearance.current.resolvedMode);
let category = $state(ALL_THEME_CATEGORIES);
let density = $state('default');
let radius = $state(10);
let fontId = $state(FONT_CATALOG[0]?.id ?? 'system');
let studioName = $state('');
let studioSeed = $state('#7c3aed');
let loadedLibrary = $state<Record<string, Theme>>({});
let loadingLibrary = $state(false);
let copyStatus = $state('');
let copyText = $state('');
let libraryError = $state('');
let themeRevision = $state(0);

const productCategories = $derived(listThemeCategories(THEME_LIBRARY_META));
const categoryItems = $derived([
  { value: ALL_THEME_CATEGORIES, label: 'All themes' },
  { value: 'Built-in', label: 'Built-in presets' },
  ...productCategories.map((value) => ({ value, label: value[0]?.toUpperCase() + value.slice(1) })),
  { value: 'Custom', label: 'Custom themes' },
]);
const visibleMetadata = $derived(
  category === ALL_THEME_CATEGORIES || !['Built-in', 'Custom'].includes(category)
    ? filterLibraryThemes(THEME_LIBRARY_META, category)
    : []
);
const customThemes = $derived.by(() => {
  void themeRevision;
  return [...themeExtras.customThemes()];
});
const visibleThemes = $derived.by(() => {
  const cards: { theme: Theme; category: string }[] = [];
  if (category === ALL_THEME_CATEGORIES || category === 'Built-in') {
    cards.push(...BUILTIN_THEMES.map((theme) => ({ theme, category: 'Built-in' })));
  }
  if (category === ALL_THEME_CATEGORIES || category === 'Custom') {
    cards.push(...customThemes.map((theme) => ({ theme, category: 'Custom' })));
  }
  for (const meta of visibleMetadata) {
    const theme = loadedLibrary[meta.id];
    if (theme) cards.push({ theme, category: meta.category });
  }
  return cards;
});
const selected = $derived(
  visibleThemes.find((card) => card.theme.id === selectedId)?.theme ??
    BUILTIN_THEMES.find((theme) => theme.id === selectedId) ??
    (BUILTIN_THEMES[0] as Theme)
);
const palette = $derived<ThemePalette>(selected[tableMode]);
const studioTheme = $derived.by(() => {
  const fontPair = FONT_CATALOG.find((item) => item.id === fontId) ?? FONT_CATALOG[0];
  const generated = createThemeFromSeed({
    id: `${selected.id}-lab`,
    name: studioName.trim() || `${selected.name} Lab`,
    seed: studioSeed,
    style: selected.style,
  });
  return {
    ...generated,
    radius: `${radius / 16}rem`,
    density: density === 'compact' ? 0.875 : density === 'comfortable' ? 1.125 : 1,
    ...(fontPair
      ? {
          fontFamily: fontPair.fontFamily,
          fontFamilyHeading: fontPair.fontFamilyHeading,
          fontFamilyMono: fontPair.fontFamilyMono,
        }
      : {}),
  };
});

/** Contrast pairs keyed by the foreground token for the token table. */
const pairs = $derived.by(() => {
  const map = new Map<string, { bg: string; ratio: number; min: number }[]>();
  for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
    const list = map.get(fg) ?? [];
    list.push({ bg, ratio: contrastRatio(palette[fg], palette[bg]), min: 4.5 });
    map.set(fg, list);
  }
  for (const [fg, bg] of UI_CONTRAST_PAIRS) {
    const list = map.get(fg) ?? [];
    list.push({ bg, ratio: contrastRatio(palette[fg], palette[bg]), min: 3 });
    map.set(fg, list);
  }
  return map;
});
const tokens = $derived(Object.entries(palette) as [keyof ThemePalette, string][]);

function changeCategory(next: string) {
  category = next;
  if (next === 'Built-in') selectedId = BUILTIN_THEMES[0]?.id ?? selectedId;
  else if (next === 'Custom')
    selectedId = customThemes[0]?.id ?? BUILTIN_THEMES[0]?.id ?? selectedId;
  else if (next !== ALL_THEME_CATEGORIES)
    selectedId = THEME_LIBRARY_META.find((entry) => entry.category === next)?.id ?? selectedId;
}

$effect(() => {
  const entries = visibleMetadata;
  if (entries.length === 0) return;
  let active = true;
  loadingLibrary = true;
  libraryError = '';
  void Promise.all(entries.map((entry) => loadLibraryTheme(entry.id)))
    .then((themes) => {
      if (!active) return;
      loadedLibrary = {
        ...loadedLibrary,
        ...Object.fromEntries(themes.map((theme) => [theme.id, theme])),
      };
      if (!entries.some((entry) => entry.id === selectedId) && category !== ALL_THEME_CATEGORIES) {
        selectedId = themes[0]?.id ?? selectedId;
      }
    })
    .catch(() => {
      if (active) libraryError = 'Some library themes could not be loaded. Try another category.';
    })
    .finally(() => {
      if (active) loadingLibrary = false;
    });
  return () => {
    active = false;
    loadingLibrary = false;
  };
});

async function useTheme(theme: Theme) {
  const result = await runService(() => activateTheme(theme, themeServices), {
    success: `Prototype theme set to ${theme.name}`,
    silentValidation: false,
    errorTitle: 'Could not apply theme',
  });
  if (result.ok) themeRevision++;
}

async function saveStudioTheme() {
  const result = await runService(
    async () => {
      const saved = await themeServices.saveCustom(studioTheme);
      await runtime.theme.setOverride({ themeId: saved.id });
      return saved;
    },
    {
      success: `Saved and previewing “${studioTheme.name}”`,
      // Surface the 24-theme limit and schema issues as toasts, not silent fails.
      silentValidation: false,
      errorTitle: 'Could not save theme',
    }
  );
  if (result.ok) themeRevision++;
}

async function copyTokens(theme: Theme) {
  copyStatus = '';
  try {
    const json = exportThemeJson(theme, (id) => themeExtras.exportTheme(id));
    copyText = json;
    await navigator.clipboard.writeText(json);
    copyStatus = `Copied ${theme.name} theme tokens.`;
  } catch {
    copyStatus = 'Clipboard access is unavailable. Copy the exported JSON below.';
  }
}
</script>

<div class="mb-6">
  <h1 class="text-2xl font-semibold tracking-tight">Theme lab</h1>
  <p class="mt-1 max-w-3xl text-muted-foreground">
    Browse the full product-category theme library, inspect scoped light and dark previews, and tune a draft beside the catalog. The component gallery documents each component state and variant.
  </p>
</div>

<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <section aria-labelledby="gallery-title">
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="gallery-title" class="text-lg font-semibold">Theme library</h2>
        <p class="text-sm text-muted-foreground">{visibleThemes.length} loaded · {THEME_LIBRARY_META.length} library presets</p>
      </div>
      <label class="grid gap-1 text-sm">
        <span class="font-medium">Category</span>
        <select class="min-h-touch w-52 rounded-lg border border-input bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Theme category" value={category} onchange={(event) => changeCategory(event.currentTarget.value)}>
          {#each categoryItems as item (item.value)}<option value={item.value}>{item.label}</option>{/each}
        </select>
      </label>
    </div>
    {#if loadingLibrary && visibleThemes.length === 0}
      <p class="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground" role="status">Loading theme tokens…</p>
    {:else if visibleThemes.length === 0}
      <p class="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No themes in this category yet.</p>
    {:else}
      <div class="grid gap-4 md:grid-cols-2">
        {#each visibleThemes as card (card.theme.id)}
          <article class="space-y-2 rounded-xl border border-border bg-surface p-3">
            <div class="flex items-start justify-between gap-2 px-1">
              <div class="min-w-0">
                <h3 class="font-semibold">{card.theme.name}</h3>
                <p class="text-xs text-muted-foreground">{card.theme.description}</p>
                <p class="mt-1 text-[11px] text-muted-foreground">{card.category}</p>
              </div>
              {#if appearance.current.theme.value === card.theme.id}<Badge variant="secondary">Active</Badge>{/if}
            </div>
            <div class="grid grid-cols-2 gap-2">
              <ThemePreview theme={card.theme} mode="light" compact />
              <ThemePreview theme={card.theme} mode="dark" compact />
            </div>
            <div class="flex flex-wrap gap-2 px-1 pb-1">
              <Button size="sm" variant="outline" onclick={() => (selectedId = card.theme.id)} aria-pressed={selectedId === card.theme.id}>Inspect tokens</Button>
              <Button size="sm" variant="ghost" onclick={() => useTheme(card.theme)}>Use in prototype</Button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
    {#if libraryError}<p class="mt-2 text-sm text-destructive" role="alert">{libraryError}</p>{/if}
  </section>

  <aside class="grid gap-4 rounded-xl border border-border bg-surface p-4" aria-labelledby="studio-title">
    <div>
      <h2 id="studio-title" class="text-lg font-semibold">Theme Studio</h2>
      <p class="text-sm text-muted-foreground">Tune a draft beside the library. Saving stores it as a custom theme in this prototype.</p>
    </div>
    <label class="grid gap-1 text-sm">
      <span class="font-medium">Theme name</span>
      <input class="min-h-touch rounded-lg border border-input bg-background px-3 text-foreground" bind:value={studioName} placeholder={`${selected.name} Lab`} aria-label="Theme Studio name" />
    </label>
    <label class="grid gap-1 text-sm">
      <span class="font-medium">Brand color</span>
      <input class="h-11 w-full rounded-lg border border-input bg-background p-1" type="color" bind:value={studioSeed} aria-label="Theme Studio brand color" />
    </label>
    <label class="grid gap-1 text-sm">
      <span class="font-medium">Font pairing</span>
      <select class="min-h-touch rounded-lg border border-input bg-background px-3 text-foreground" bind:value={fontId} aria-label="Theme Studio font pairing">
        {#each FONT_CATALOG as fontOption (fontOption.id)}<option value={fontOption.id}>{fontOption.label}</option>{/each}
      </select>
    </label>
    <label class="grid gap-1 text-sm">
      <span class="flex justify-between"><span class="font-medium">Density</span><span class="text-muted-foreground">{density}</span></span>
      <select class="min-h-touch rounded-lg border border-input bg-background px-3 text-foreground" bind:value={density} aria-label="Theme Studio density">
        <option value="compact">Compact</option><option value="default">Default</option><option value="comfortable">Comfortable</option>
      </select>
    </label>
    <label class="grid gap-1 text-sm">
      <span class="font-medium">Corner radius: {radius}px</span>
      <input class="min-h-touch accent-primary" type="range" min="0" max="20" step="1" bind:value={radius} aria-label="Theme Studio corner radius" />
    </label>
    <div class="grid grid-cols-2 gap-2">
      <ThemePreview theme={studioTheme} mode="light" compact />
      <ThemePreview theme={studioTheme} mode="dark" compact />
    </div>
    <Button onclick={saveStudioTheme}>Save draft as custom theme</Button>
  </aside>
</div>

<section class="mt-10" aria-labelledby="tokens-title">
  <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 id="tokens-title" class="text-lg font-semibold">Tokens — {selected.name}</h2>
      <p class="text-sm text-muted-foreground">Live values with contrast ratios (text ≥ 4.5:1, focus ring ≥ 3:1).</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" for="theme-token-selection">Theme to inspect</label>
      <select id="theme-token-selection" class="min-h-touch w-48 rounded-lg border border-input bg-background px-3 text-foreground" bind:value={selectedId} aria-label="Theme to inspect">
        {#each visibleThemes as card (card.theme.id)}<option value={card.theme.id}>{card.theme.name}</option>{/each}
      </select>
      <div class="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Token mode">
        {#each ['light', 'dark'] as const as mode (mode)}
          <button type="button" aria-pressed={tableMode === mode} class="min-h-touch rounded-md px-3 text-sm font-medium capitalize sm:min-h-8 {tableMode === mode ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'}" onclick={() => (tableMode = mode)}>{mode}</button>
        {/each}
      </div>
      <Button size="sm" variant="outline" onclick={() => copyTokens(selected)}>Copy theme tokens</Button>
    </div>
  </div>
  {#if copyStatus}<p class="mb-2 text-sm text-muted-foreground" role="status">{copyStatus}</p>{/if}
  {#if copyText && copyStatus.startsWith('Clipboard access')}
    <label class="mb-3 grid gap-1 text-sm">
      <span>Exported theme JSON</span>
      <textarea class="min-h-32 rounded-lg border border-input bg-background p-3 font-mono text-xs text-foreground" readonly value={copyText} aria-label="Exported theme JSON"></textarea>
    </label>
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -- the wide table scrolls; keyboard users must reach it (WCAG 2.1.1). -->
  <div class="overflow-x-auto rounded-xl border border-border bg-surface" tabindex="0" role="region" aria-label="Token table">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">{selected.name} {tableMode} tokens and contrast ratios</caption>
      <thead class="bg-muted text-xs text-muted-foreground">
        <tr><th scope="col" class="px-3 py-2 font-medium">Token</th><th scope="col" class="px-3 py-2 font-medium">CSS variable</th><th scope="col" class="px-3 py-2 font-medium">Value</th><th scope="col" class="px-3 py-2 font-medium">Contrast</th></tr>
      </thead>
      <tbody>
        {#each tokens as [token, value] (token)}
          <tr class="border-t border-border">
            <th scope="row" class="px-3 py-2 font-medium whitespace-nowrap"><span class="inline-flex items-center gap-2"><span class="size-5 shrink-0 rounded border border-border" style:background-color={value} aria-hidden="true"></span>{token}</span></th>
            <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{tokenToCssVar(token)}</td>
            <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{value}</td>
            <td class="px-3 py-2"><div class="flex flex-wrap gap-1">
              {#each pairs.get(token) ?? [] as pair (pair.bg)}<Badge variant={pair.ratio >= pair.min ? 'success' : 'destructive'} class="font-mono" title={`${token} on ${pair.bg}`}>on {pair.bg}: {pair.ratio.toFixed(2)}{pair.ratio >= pair.min ? ' ✓' : ' ✗'}</Badge>{:else}<span class="text-xs text-muted-foreground">{parseHex(value) ? '—' : 'translucent'}</span>{/each}
            </div></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
