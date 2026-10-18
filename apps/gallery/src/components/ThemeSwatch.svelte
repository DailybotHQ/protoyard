<script lang="ts">
import type { ThemeCardData } from '../lib/theme-catalog.ts';
import { withThemeParam } from '../lib/theme-catalog.ts';

interface Props {
  theme: ThemeCardData;
  /** Base URL of a prototype preview (or detail page) to open with `?theme=`. */
  previewUrl: string | null;
  previewLabel?: string;
}

let { theme, previewUrl, previewLabel = 'Open preview' }: Props = $props();

const lightHref = $derived(previewUrl ? withThemeParam(previewUrl, theme.id, 'light') : null);
const darkHref = $derived(previewUrl ? withThemeParam(previewUrl, theme.id, 'dark') : null);
</script>

<article
  class="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
  data-theme-id={theme.id}
  data-theme-category={theme.category}
  data-testid="theme-swatch"
>
  <div class="border-b border-line px-4 py-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-base font-semibold tracking-tight text-fg">{theme.name}</h3>
      <span class="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">{theme.id}</span>
    </div>
    <p class="mt-1 text-sm text-muted">{theme.description || 'No description.'}</p>
    <div class="mt-2 flex flex-wrap gap-1.5">
      <span class="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-fg">{theme.category}</span>
      {#each theme.tags.slice(0, 4) as tag (tag)}
        <span class="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">#{tag}</span>
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-0 sm:grid-cols-2">
    <section
      class="theme-preview border-b border-line p-4 sm:border-r sm:border-b-0"
      style={theme.lightStyle}
      aria-label={`${theme.name} light mode sample`}
      data-mode="light"
    >
      <p class="mb-3 text-[11px] font-medium tracking-wide text-[color:var(--py-muted-foreground)] uppercase">
        Light
      </p>
      {@render sample()}
    </section>
    <section
      class="theme-preview p-4"
      style={theme.darkStyle}
      aria-label={`${theme.name} dark mode sample`}
      data-mode="dark"
    >
      <p class="mb-3 text-[11px] font-medium tracking-wide text-[color:var(--py-muted-foreground)] uppercase">
        Dark
      </p>
      {@render sample()}
    </section>
  </div>

  {#if lightHref && darkHref}
    <div class="flex flex-wrap gap-2 border-t border-line bg-surface-2/60 px-4 py-3 text-sm">
      <a
        class="inline-flex items-center rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:bg-accent-hover"
        href={lightHref}
        target="_blank"
        rel="noopener"
      >
        {previewLabel} (light)
      </a>
      <a
        class="inline-flex items-center rounded-md border border-line bg-surface px-3 py-1.5 font-medium text-fg hover:bg-surface-2"
        href={darkHref}
        target="_blank"
        rel="noopener"
      >
        {previewLabel} (dark)
      </a>
    </div>
  {/if}
</article>

{#snippet sample()}
  <div
    class="rounded-[var(--py-radius)] border border-[color:var(--py-border)] bg-[color:var(--py-background)] p-3 text-[color:var(--py-foreground)] shadow-[var(--py-shadow-soft)]"
    style="font-family: var(--py-font-sans); letter-spacing: var(--py-letter-spacing-body);"
  >
    <p
      class="text-sm font-semibold"
      style="font-family: var(--py-font-heading); font-weight: var(--py-font-weight-heading); letter-spacing: var(--py-letter-spacing-heading);"
    >
      Sample heading
    </p>
    <p class="mt-1 text-xs text-[color:var(--py-muted-foreground)]">
      Body text on the canvas with muted supporting copy.
    </p>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
        style="background: var(--py-primary); color: var(--py-primary-foreground); border-radius: var(--py-radius);"
      >
        Primary
      </span>
      <span
        class="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium"
        style="background: var(--py-secondary); color: var(--py-secondary-foreground); border-color: var(--py-border); border-radius: var(--py-radius);"
      >
        Secondary
      </span>
      <span
        class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
        style="background: var(--py-destructive); color: var(--py-destructive-foreground); border-radius: var(--py-radius);"
      >
        Destructive
      </span>
      <span
        class="inline-flex size-3 rounded-full"
        style="background: var(--py-chart1);"
        aria-hidden="true"
      ></span>
      <span
        class="inline-flex size-3 rounded-full"
        style="background: var(--py-chart2);"
        aria-hidden="true"
      ></span>
      <span
        class="inline-flex size-3 rounded-full"
        style="background: var(--py-success);"
        aria-hidden="true"
      ></span>
    </div>
    <div
      class="mt-3 rounded-[var(--py-radius)] border border-[color:var(--py-border)] bg-[color:var(--py-surface)] p-2 text-xs text-[color:var(--py-surface-foreground)]"
    >
      Surface card · radius {theme.id}
    </div>
  </div>
{/snippet}
