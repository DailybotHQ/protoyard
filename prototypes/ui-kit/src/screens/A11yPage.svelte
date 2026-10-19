<script lang="ts">
import { CircleCheck } from '@lucide/svelte';
import { getRuntime, useAppearance } from '@protoyard/renderer-svelte';
import type { ThemeControllerExtras } from '@protoyard/runtime';
import {
  BUILTIN_THEMES,
  getTheme,
  loadAllLibraryThemes,
  TEXT_CONTRAST_PAIRS,
} from '@protoyard/themes';
import { Badge, Kbd } from '@protoyard/ui';
import { onMount } from 'svelte';
import { auditThemeContrast, auditThemesContrast } from '../lib/theme-lab.ts';

const runtime = getRuntime();
const appearance = useAppearance();
const themeExtras = runtime.theme as typeof runtime.theme & ThemeControllerExtras;

let libraryThemes = $state<import('@protoyard/core').Theme[]>([]);
let libraryError = $state('');

onMount(() => {
  void loadAllLibraryThemes()
    .then((themes) => {
      libraryThemes = [...themes];
    })
    .catch(() => {
      libraryError = 'Library themes could not be loaded for the catalog audit.';
    });
});

/** Live audit of the theme the prototype is using (built-in, library or custom). */
const audit = $derived.by(() => {
  const extras = [...runtime.theme.themes(), ...themeExtras.customThemes(), ...libraryThemes];
  const theme = getTheme(appearance.current.theme.value, extras);
  return auditThemeContrast(theme, appearance.current.resolvedMode);
});

/** Catalog sweep: built-ins + custom + loaded library, both modes. */
const catalogAudit = $derived.by(() => {
  const themes = [...BUILTIN_THEMES, ...themeExtras.customThemes(), ...libraryThemes];
  // Dedupe by id (custom may already be in runtime.themes).
  const byId = new Map(themes.map((theme) => [theme.id, theme]));
  const results = auditThemesContrast([...byId.values()]);
  const failing = results.filter((row) => row.failing.length > 0);
  return {
    total: results.length,
    themeCount: byId.size,
    failing,
  };
});

const principles = [
  {
    title: 'Visible focus everywhere',
    body: 'Every interactive element shows a 2px ring in the theme `ring` color (≥ 3:1 against surfaces) on keyboard focus only.',
  },
  {
    title: 'Contrast is tested, not hoped for',
    body: 'All text pairs in every built-in, library and custom theme reach WCAG AA 4.5:1 in light and dark; the test suite fails otherwise.',
  },
  {
    title: '44px touch targets on phones',
    body: 'Buttons, tabs, menu items and nav items grow to 44px below the `sm` breakpoint (`min-h-touch`).',
  },
  {
    title: 'Reduced motion',
    body: 'Animations collapse when the OS asks for it or when the prototype sets reduced motion in DevTools (`data-py-motion="reduce"`).',
  },
  {
    title: 'Labels are wired, not implied',
    body: 'FormField connects label, description and error with `for`, `aria-describedby` and `aria-invalid`; Select announces its value as a description.',
  },
  {
    title: 'Overlays manage focus',
    body: 'Dialogs, sheets and menus trap focus, restore it to the trigger and close on Esc; destructive confirms use AlertDialog.',
  },
  {
    title: 'Live regions for changes',
    body: 'Toasts announce through persistent polite/assertive regions; chat threads use `role="log"`.',
  },
  {
    title: 'Safe areas',
    body: 'BottomNav, MobileHeader and SafeArea respect notches and home indicators (`env(safe-area-inset-*)`).',
  },
];

const keys = [
  { keys: ['Tab', '⇧ Tab'], what: 'Move between controls' },
  { keys: ['Enter', 'Space'], what: 'Activate buttons, rows and cards' },
  { keys: ['↑', '↓'], what: 'Move inside menus, selects, radio groups' },
  { keys: ['←', '→'], what: 'Switch tabs' },
  { keys: ['Esc'], what: 'Close dialogs, sheets, menus and DevTools' },
  { keys: ['Ctrl/⌘', '.'], what: 'Toggle DevTools' },
];
</script>

<div class="mb-6">
  <h1 class="text-2xl font-semibold tracking-tight">Accessibility</h1>
  <p class="mt-1 max-w-2xl text-muted-foreground">What the kit guarantees, and how to keep it that way when you compose screens.</p>
</div>

<section aria-labelledby="audit-title" class="rounded-xl border border-border bg-surface p-5">
  <h2 id="audit-title" class="font-semibold">Live contrast audit</h2>
  <p class="mt-1 text-sm text-muted-foreground">
    {audit.theme.name} · {appearance.current.resolvedMode}: {TEXT_CONTRAST_PAIRS.length} text pairs, lowest ratio
    <span class="font-mono text-foreground">{audit.lowest.toFixed(2)}:1</span>.
  </p>
  {#if audit.failing.length === 0}
    <p class="mt-3 inline-flex items-center gap-2 text-sm font-medium text-success"><CircleCheck class="size-4" aria-hidden="true" />All pairs pass WCAG AA.</p>
  {:else}
    <ul class="mt-3 space-y-1">
      {#each audit.failing as f (`${f.fg}-${f.bg}`)}<li><Badge variant="destructive">{f.fg} on {f.bg}: {f.ratio.toFixed(2)}</Badge></li>{/each}
    </ul>
  {/if}
  <p class="mt-3 text-xs text-muted-foreground">Change the theme or mode in DevTools or the Theme lab and this audit follows (built-in, library and custom).</p>
</section>

<section aria-labelledby="catalog-audit-title" class="mt-6 rounded-xl border border-border bg-surface p-5">
  <h2 id="catalog-audit-title" class="font-semibold">Catalog contrast sweep</h2>
  <p class="mt-1 text-sm text-muted-foreground">
    {catalogAudit.themeCount} themes · {catalogAudit.total} mode checks (built-in, library and custom).
  </p>
  {#if libraryError}
    <p class="mt-2 text-sm text-warning" role="status">{libraryError}</p>
  {/if}
  {#if catalogAudit.failing.length === 0}
    <p class="mt-3 inline-flex items-center gap-2 text-sm font-medium text-success">
      <CircleCheck class="size-4" aria-hidden="true" />Every loaded theme passes text and UI contrast.
    </p>
  {:else}
    <ul class="mt-3 max-h-40 space-y-1 overflow-y-auto">
      {#each catalogAudit.failing as row (`${row.theme.id}-${row.mode}`)}
        <li>
          <Badge variant="destructive">
            {row.theme.name} · {row.mode}: {row.failing.length} pair(s), lowest {row.lowest.toFixed(2)}:1
          </Badge>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="mt-8" aria-labelledby="principles-title">
  <h2 id="principles-title" class="mb-3 text-lg font-semibold">Guarantees</h2>
  <ul class="grid gap-3 md:grid-cols-2">
    {#each principles as p (p.title)}
      <li class="rounded-xl border border-border bg-surface p-4">
        <p class="font-medium">{p.title}</p>
        <p class="mt-1 text-sm text-muted-foreground">{p.body}</p>
      </li>
    {/each}
  </ul>
</section>

<section class="mt-8" aria-labelledby="keys-title">
  <h2 id="keys-title" class="mb-3 text-lg font-semibold">Keyboard map</h2>
  <dl class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
    {#each keys as k (k.what)}
      <div class="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
        <dt class="flex flex-wrap gap-1">{#each k.keys as key (key)}<Kbd>{key}</Kbd>{/each}</dt>
        <dd class="text-right text-muted-foreground">{k.what}</dd>
      </div>
    {/each}
  </dl>
</section>

<section class="mt-8" aria-labelledby="checklist-title">
  <h2 id="checklist-title" class="mb-3 text-lg font-semibold">When you compose screens</h2>
  <ul class="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
    <li>Give icon-only buttons an <code class="font-mono">aria-label</code>; decorative icons get <code class="font-mono">aria-hidden</code>.</li>
    <li>Use one <code class="font-mono">h1</code> per screen and keep heading levels in order.</li>
    <li>Use <code class="font-mono">warning</code> as a fill with <code class="font-mono">warning-foreground</code> text, never as text on a surface.</li>
    <li>Wrap mutations in <code class="font-mono">runService()</code> so failures are announced as toasts.</li>
  </ul>
</section>
