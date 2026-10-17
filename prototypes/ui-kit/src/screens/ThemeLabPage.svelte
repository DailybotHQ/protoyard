<script lang="ts">
import { type Theme, type ThemePalette, tokenToCssVar } from '@protoyard/core';
import { getRuntime, runService, useAppearance } from '@protoyard/renderer-svelte';
import {
  BUILTIN_THEMES,
  contrastRatio,
  type Density,
  parseHex,
  TEXT_CONTRAST_PAIRS,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import { Badge, Button, Select } from '@protoyard/ui';
import ThemePreview from '../components/ThemePreview.svelte';

const runtime = getRuntime();
const appearance = useAppearance();
let selectedId = $state(appearance.current.theme.value);
let tableMode = $state<'light' | 'dark'>(appearance.current.resolvedMode);
let density = $state<string>('default');
let radius = $state(10);

const selected = $derived(
  BUILTIN_THEMES.find((t) => t.id === selectedId) ?? (BUILTIN_THEMES[0] as Theme)
);
const palette = $derived<ThemePalette>(selected[tableMode]);
const tuned = $derived<Theme>({ ...selected, radius: `${radius / 16}rem` });

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

async function useTheme(themeId: string) {
  await runService(() => runtime.theme.setOverride({ themeId }), {
    success: `Prototype theme set to ${BUILTIN_THEMES.find((t) => t.id === themeId)?.name}`,
  });
}
</script>

<div class="mb-6">
  <h1 class="text-2xl font-semibold tracking-tight">Theme lab</h1>
  <p class="mt-1 max-w-2xl text-muted-foreground">
    Every built-in theme in light and dark, rendered with scoped <code class="font-mono text-sm">applyAppearance()</code> — the page keeps its own theme.
    Light and dark are designed separately; every text pair is tested for WCAG AA.
  </p>
</div>

<section aria-labelledby="gallery-title">
  <h2 id="gallery-title" class="mb-3 text-lg font-semibold">All themes</h2>
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each BUILTIN_THEMES as theme (theme.id)}
      <article class="space-y-2 rounded-xl border border-border bg-surface p-3">
        <div class="flex items-start justify-between gap-2 px-1">
          <div>
            <h3 class="font-semibold">{theme.name}</h3>
            <p class="text-xs text-muted-foreground">{theme.description}</p>
          </div>
          {#if appearance.current.theme.value === theme.id}<Badge variant="secondary">Active</Badge>{/if}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <ThemePreview {theme} mode="light" compact />
          <ThemePreview {theme} mode="dark" compact />
        </div>
        <div class="flex gap-2 px-1 pb-1">
          <Button size="sm" variant="outline" onclick={() => (selectedId = theme.id)} aria-pressed={selectedId === theme.id}>Inspect tokens</Button>
          <Button size="sm" variant="ghost" onclick={() => useTheme(theme.id)}>Use in prototype</Button>
        </div>
      </article>
    {/each}
  </div>
</section>

<section class="mt-10" aria-labelledby="tuning-title">
  <h2 id="tuning-title" class="text-lg font-semibold">Density & radius — {selected.name}</h2>
  <p class="mb-3 text-sm text-muted-foreground">Density scales the whole spacing system; radius drives every rounded corner.</p>
  <div class="flex flex-wrap items-end gap-4">
    <label class="block text-sm">
      <span class="mb-1 block font-medium">Density</span>
      <Select
        class="w-44"
        aria-label="Density"
        items={[
          { value: 'compact', label: 'Compact (0.875)' },
          { value: 'default', label: 'Default (1)' },
          { value: 'comfortable', label: 'Comfortable (1.125)' },
        ]}
        bind:value={density}
      />
    </label>
    <label class="block text-sm">
      <span class="mb-1 block font-medium">Radius: {radius}px</span>
      <input type="range" min="0" max="20" step="1" class="w-48 accent-primary" bind:value={radius} aria-valuetext={`${radius} pixels`} />
    </label>
  </div>
  <div class="mt-4 grid gap-4 md:grid-cols-2">
    <ThemePreview theme={tuned} mode="light" density={density as Density} />
    <ThemePreview theme={tuned} mode="dark" density={density as Density} />
  </div>
</section>

<section class="mt-10" aria-labelledby="tokens-title">
  <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 id="tokens-title" class="text-lg font-semibold">Tokens — {selected.name}</h2>
      <p class="text-sm text-muted-foreground">Live values with contrast ratios (text ≥ 4.5:1, focus ring ≥ 3:1).</p>
    </div>
    <div class="flex gap-2">
      <Select
        class="w-40"
        aria-label="Theme to inspect"
        items={BUILTIN_THEMES.map((t) => ({ value: t.id, label: t.name }))}
        bind:value={selectedId}
      />
      <div class="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Token mode">
        {#each ['light', 'dark'] as const as m (m)}
          <button
            type="button"
            aria-pressed={tableMode === m}
            class="min-h-touch rounded-md px-3 text-sm font-medium capitalize sm:min-h-8 {tableMode === m
              ? 'bg-surface text-foreground shadow-soft'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => (tableMode = m)}
          >
            {m}
          </button>
        {/each}
      </div>
    </div>
  </div>
  <div class="overflow-x-auto rounded-xl border border-border bg-surface">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">{selected.name} {tableMode} tokens and contrast ratios</caption>
      <thead class="bg-muted text-xs text-muted-foreground">
        <tr>
          <th scope="col" class="px-3 py-2 font-medium">Token</th>
          <th scope="col" class="px-3 py-2 font-medium">CSS variable</th>
          <th scope="col" class="px-3 py-2 font-medium">Value</th>
          <th scope="col" class="px-3 py-2 font-medium">Contrast</th>
        </tr>
      </thead>
      <tbody>
        {#each tokens as [token, value] (token)}
          <tr class="border-t border-border">
            <th scope="row" class="px-3 py-2 font-medium whitespace-nowrap">
              <span class="inline-flex items-center gap-2">
                <span class="size-5 shrink-0 rounded border border-border" style:background-color={value} aria-hidden="true"></span>
                {token}
              </span>
            </th>
            <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{tokenToCssVar(token)}</td>
            <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{value}</td>
            <td class="px-3 py-2">
              <div class="flex flex-wrap gap-1">
                {#each pairs.get(token) ?? [] as pair (pair.bg)}
                  <Badge variant={pair.ratio >= pair.min ? 'success' : 'destructive'} class="font-mono" title={`${token} on ${pair.bg}`}>
                    on {pair.bg}: {pair.ratio.toFixed(2)}{pair.ratio >= pair.min ? ' ✓' : ' ✗'}
                  </Badge>
                {:else}
                  <span class="text-xs text-muted-foreground">{parseHex(value) ? '—' : 'translucent'}</span>
                {/each}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
