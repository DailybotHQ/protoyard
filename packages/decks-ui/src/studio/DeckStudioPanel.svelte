<script lang="ts">
import type { DeckStudio } from './studio.svelte.ts';

/**
 * The Deck Studio DevTools tab: deck style, the current slide, and the
 * export. Every control writes to the studio's in-memory edits; the host's
 * `DeckApp` renders `studio.preview`, so changes show live.
 */
let { studio }: { studio: DeckStudio; [key: string]: unknown } = $props();

const options = $derived(studio.options);
const style = $derived(studio.preview.style);
const slide = $derived(studio.slide);
let copying = $state(false);
let status = $state('');
let exportField = $state<HTMLTextAreaElement | undefined>();

const seedHex = $derived(
  style.paletteSeed === undefined
    ? ''
    : `#${style.paletteSeed.toString(16).padStart(6, '0').slice(-6)}`
);
const downloadHref = $derived(
  `data:application/json;charset=utf-8,${encodeURIComponent(studio.patchJson)}`
);
const operationCount = $derived(studio.patch.length);

/** `''` in a select means "use the default", which removes the field. */
const orNull = (value: string) => (value === '' ? null : value);

function setSeed(raw: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(raw.trim());
  if (raw.trim() === '') studio.setStyle('paletteSeed', null);
  else if (match) studio.setStyle('paletteSeed', Number.parseInt(match[1] as string, 16));
  else status = 'Use a six-digit hex color for the palette seed, such as #2563eb.';
}

async function copyPatch() {
  copying = true;
  status = '';
  try {
    await navigator.clipboard.writeText(studio.patchJson);
    status = 'Patch copied.';
  } catch {
    exportField?.select();
    status = 'Copying is blocked here: the patch is selected, press Ctrl or ⌘ + C.';
  } finally {
    copying = false;
  }
}

const field = 'grid gap-1 text-[12px]';
const control =
  'h-8 rounded-md border border-border bg-surface px-2 text-[12px] text-surface-foreground focus-visible:outline-2 focus-visible:outline-ring';
const button =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-[12px] font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60';
</script>

<div class="grid gap-4 p-3" data-py-deck-studio>
  <section class="grid gap-2" aria-labelledby="py-ds-style">
    <h3 id="py-ds-style" class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Deck style</h3>
    <label class={field}>
      Theme
      <select class={control} value={style.theme ?? ''} onchange={(e) => studio.setStyle('theme', orNull(e.currentTarget.value))}>
        <option value="">Default</option>
        {#each options.themes as theme (theme.id)}
          <option value={theme.id}>{theme.label}</option>
        {/each}
      </select>
    </label>
    <label class={field}>
      Palette seed (replaces the theme)
      <input class={control} type="text" inputmode="text" placeholder="#2563eb" value={seedHex} onchange={(e) => setSeed(e.currentTarget.value)} />
    </label>
    <label class={field}>
      Font pair
      <select class={control} value={style.fontPair ?? ''} onchange={(e) => studio.setStyle('fontPair', orNull(e.currentTarget.value))}>
        <option value="">Theme default</option>
        {#each options.fontPairs as pair (pair.id)}
          <option value={pair.id}>{pair.label}</option>
        {/each}
      </select>
    </label>
    <div class="grid grid-cols-2 gap-2">
      <label class={field}>
        Aspect
        <select class={control} value={style.aspect ?? '16:9'} onchange={(e) => studio.setStyle('aspect', e.currentTarget.value as never)}>
          {#each options.aspects as aspect (aspect)}
            <option value={aspect}>{aspect}</option>
          {/each}
        </select>
      </label>
      <label class={field}>
        Motion
        <select class={control} value={style.motion ?? 'full'} onchange={(e) => studio.setStyle('motion', e.currentTarget.value as never)}>
          {#each options.motions as motion (motion)}
            <option value={motion}>{motion}</option>
          {/each}
        </select>
      </label>
      <label class={field}>
        Deck background
        <select class={control} value={style.background ?? ''} onchange={(e) => studio.setStyle('background', orNull(e.currentTarget.value))}>
          <option value="">Default</option>
          {#each options.backgrounds as background (background)}
            <option value={background}>{background}</option>
          {/each}
        </select>
      </label>
      <label class={field}>
        Progress
        <select class={control} value={style.progress ?? 'bottom'} onchange={(e) => studio.setStyle('progress', e.currentTarget.value as never)}>
          {#each options.progress as position (position)}
            <option value={position}>{position}</option>
          {/each}
        </select>
      </label>
    </div>
    <label class="inline-flex items-center gap-2 text-[12px]">
      <input type="checkbox" checked={style.slideNumbers !== false} onchange={(e) => studio.setStyle('slideNumbers', e.currentTarget.checked ? null : false)} />
      Slide numbers
    </label>
  </section>

  <section class="grid gap-2" aria-labelledby="py-ds-slide">
    <h3 id="py-ds-slide" class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Slide</h3>
    <label class={field}>
      Edit slide
      <select class={control} value={studio.slideId} onchange={(e) => studio.selectSlide(e.currentTarget.value)}>
        {#each studio.preview.slides as item, index (item.id)}
          <option value={item.id}>{index + 1}. {item.title ?? item.id}</option>
        {/each}
      </select>
    </label>
    {#if slide}
      <label class={field}>
        Layout
        <select
          class={control}
          value={slide.layout}
          disabled={studio.layoutChoices.length < 2}
          onchange={(e) => studio.setSlide('layout', e.currentTarget.value)}
        >
          {#each studio.layoutChoices as layout (layout)}
            <option value={layout}>{layout}</option>
          {/each}
        </select>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class={field}>
          Slide background
          <select class={control} value={slide.background ?? ''} onchange={(e) => studio.setSlide('background', orNull(e.currentTarget.value))}>
            <option value="">Deck default</option>
            {#each options.backgrounds as background (background)}
              <option value={background}>{background}</option>
            {/each}
          </select>
        </label>
        <label class={field}>
          Slide transition
          <select class={control} value={slide.transition ?? ''} onchange={(e) => studio.setSlide('transition', orNull(e.currentTarget.value) as never)}>
            <option value="">Deck default</option>
            {#each options.transitions as transition (transition)}
              <option value={transition}>{transition}</option>
            {/each}
          </select>
        </label>
      </div>
      <label class="inline-flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={slide.hidden === true} onchange={(e) => studio.setSlide('hidden', e.currentTarget.checked)} />
        Hide this slide
      </label>
    {/if}
  </section>

  <section class="grid gap-2" aria-labelledby="py-ds-export">
    <h3 id="py-ds-export" class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Export</h3>
    {#if studio.issues.length > 0}
      <ul class="grid gap-1 text-[12px] text-destructive" role="alert">
        {#each studio.issues as issue (issue.jsonPath + issue.message)}
          <li><code>{issue.jsonPath}</code>: {issue.message}</li>
        {/each}
      </ul>
    {/if}
    <p class="text-[12px] text-muted-foreground">
      {operationCount === 0 ? 'No changes yet.' : `${operationCount} JSON Patch operation${operationCount === 1 ? '' : 's'} (RFC 6902) for the source deck.`}
    </p>
    <textarea
      bind:this={exportField}
      class="h-32 rounded-md border border-border bg-surface p-2 font-mono text-[11px] text-surface-foreground"
      readonly
      aria-label="Deck patch (JSON)">{studio.patchJson}</textarea>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={button} disabled={copying || operationCount === 0} aria-busy={copying} onclick={copyPatch}>
        {copying ? 'Copying…' : 'Copy patch'}
      </button>
      <a class={button} href={downloadHref} download="deck-studio.patch.json" aria-disabled={operationCount === 0}>Download patch</a>
      <button type="button" class={button} disabled={operationCount === 0} onclick={() => studio.reset()}>Reset</button>
    </div>
    <p class="min-h-4 text-[12px]" role="status" aria-live="polite">{status}</p>
  </section>
</div>
