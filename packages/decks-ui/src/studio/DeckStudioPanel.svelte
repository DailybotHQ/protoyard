<script lang="ts">
import { deckStudioOptions } from '@protoyard/decks/patch';
import { Button, buttonVariants } from 'texuli/button';
import { Checkbox } from 'texuli/choice';
import { cx } from 'texuli/cx';
import { Field } from 'texuli/field';
import { Input, Textarea } from 'texuli/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from 'texuli/select';
import type { DeckStudio } from './studio.svelte.ts';

/**
 * The Deck Studio DevTools tab: deck style, the current slide, and the
 * export. Every control writes to the studio's in-memory edits; the host's
 * `DeckApp` renders `studio.preview`, so changes show live.
 */
let { studio }: { studio: DeckStudio; [key: string]: unknown } = $props();

// The choices load with this lazy panel: the theme list includes the library catalog.
const options = deckStudioOptions();
const style = $derived(studio.preview.style);
const slide = $derived(studio.slide);
let copying = $state(false);
let status = $state('');
let exportField = $state<HTMLElement | null>(null);

const seedHex = $derived(
  style.paletteSeed === undefined
    ? ''
    : `#${style.paletteSeed.toString(16).padStart(6, '0').slice(-6)}`
);
const downloadHref = $derived(
  `data:application/json;charset=utf-8,${encodeURIComponent(studio.patchJson)}`
);
const operationCount = $derived(studio.patch.length);

/** The "use the default" choice of a select, which removes the field. */
const DEFAULT = '__default__';
const orDefault = (value: string | undefined | null) => value ?? DEFAULT;
const orNull = (value: string) => (value === DEFAULT ? null : value);

interface Choice {
  value: string;
  label: string;
}
const withDefault = (label: string, values: readonly Choice[]): Choice[] => [
  { value: DEFAULT, label },
  ...values,
];
const plain = (values: readonly string[]): Choice[] =>
  values.map((value) => ({ value, label: value }));
/** A slide background authored as a spec object (not a preset) keeps a choice of its own. */
const CUSTOM = '__custom__';
const slideBackground = $derived(
  slide?.background === undefined
    ? DEFAULT
    : typeof slide.background === 'string'
      ? slide.background
      : CUSTOM
);
const slideBackgrounds = $derived([
  ...withDefault('Deck default', plain(options.backgrounds)),
  ...(slideBackground === CUSTOM ? [{ value: CUSTOM, label: 'Custom (deck JSON)' }] : []),
]);

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
    (exportField as HTMLTextAreaElement | null)?.select();
    status = 'Copying is blocked here: the patch is selected, press Ctrl or ⌘ + C.';
  } finally {
    copying = false;
  }
}

// The download is a data: URL, which Texuli's Button href policy refuses: an anchor styled as one.
const linkButton = cx(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'aria-disabled:pointer-events-none aria-disabled:opacity-60'
);
</script>

{#snippet choice(
  label: string,
  value: string,
  items: readonly Choice[],
  onchange: (value: string) => void,
  disabled = false
)}
  <Field {label} {disabled} class="gap-1 text-[12px]">
    {#snippet children(control)}
      <SelectRoot {value} items={[...items]} {disabled} onValueChange={(next) => onchange(next)}>
        <SelectTrigger {...control.props} size="sm" class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {#each items as item (item.value)}
            <SelectItem value={item.value} label={item.label}>{item.label}</SelectItem>
          {/each}
        </SelectContent>
      </SelectRoot>
    {/snippet}
  </Field>
{/snippet}

<div class="grid gap-4 p-3" data-py-deck-studio>
  <section class="grid gap-2" aria-labelledby="py-ds-style">
    <h3 id="py-ds-style" class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Deck style</h3>
    {@render choice(
      'Theme',
      orDefault(style.theme),
      withDefault('Default', options.themes.map((theme) => ({ value: theme.id, label: theme.label }))),
      (value) => studio.setStyle('theme', orNull(value))
    )}
    <Field label="Palette seed (replaces the theme)" class="gap-1 text-[12px]">
      {#snippet children(control)}
        <Input
          {...control.props}
          type="text"
          inputmode="text"
          placeholder="#2563eb"
          value={seedHex}
          onchange={(e) => setSeed(e.currentTarget.value)}
        />
      {/snippet}
    </Field>
    {@render choice(
      'Font pair',
      orDefault(style.fontPair),
      withDefault('Theme default', options.fontPairs.map((pair) => ({ value: pair.id, label: pair.label }))),
      (value) => studio.setStyle('fontPair', orNull(value))
    )}
    <div class="grid grid-cols-2 gap-2">
      {@render choice('Aspect', style.aspect ?? '16:9', plain(options.aspects), (value) =>
        studio.setStyle('aspect', value as never)
      )}
      {@render choice('Motion', style.motion ?? 'full', plain(options.motions), (value) =>
        studio.setStyle('motion', value as never)
      )}
      {@render choice(
        'Deck background',
        orDefault(style.background),
        withDefault('Default', plain(options.backgrounds)),
        (value) => studio.setStyle('background', orNull(value))
      )}
      {@render choice('Progress', style.progress ?? 'bottom', plain(options.progress), (value) =>
        studio.setStyle('progress', value as never)
      )}
    </div>
    <Checkbox
      label="Slide numbers"
      class="text-[12px]"
      checked={style.slideNumbers !== false}
      onCheckedChange={(checked) => studio.setStyle('slideNumbers', checked ? null : false)}
    />
  </section>

  <section class="grid gap-2" aria-labelledby="py-ds-slide">
    <h3 id="py-ds-slide" class="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Slide</h3>
    {@render choice(
      'Edit slide',
      studio.slideId,
      studio.preview.slides.map((item, index) => ({
        value: item.id,
        label: `${index + 1}. ${item.title ?? item.id}`,
      })),
      (value) => studio.selectSlide(value)
    )}
    {#if slide}
      {@render choice(
        'Layout',
        slide.layout,
        plain(studio.layoutChoices),
        (value) => studio.setSlide('layout', value),
        studio.layoutChoices.length < 2
      )}
      <div class="grid grid-cols-2 gap-2">
        {@render choice(
          'Slide background',
          slideBackground,
          slideBackgrounds,
          (value) => {
            if (value !== CUSTOM) studio.setSlide('background', orNull(value));
          }
        )}
        {@render choice(
          'Slide transition',
          orDefault(slide.transition),
          withDefault('Deck default', plain(options.transitions)),
          (value) => studio.setSlide('transition', orNull(value) as never)
        )}
      </div>
      <Checkbox
        label="Hide this slide"
        class="text-[12px]"
        checked={slide.hidden === true}
        onCheckedChange={(checked) => studio.setSlide('hidden', checked)}
      />
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
    <Textarea
      bind:ref={exportField}
      class="h-32 font-mono text-[11px]"
      readonly
      aria-label="Deck patch (JSON)"
      value={studio.patchJson}
    />
    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        loading={copying}
        autoLoading={false}
        loadingLabel="Copying…"
        disabled={operationCount === 0}
        onclick={copyPatch}
      >
        Copy patch
      </Button>
      <a class={linkButton} href={downloadHref} download="deck-studio.patch.json" aria-disabled={operationCount === 0}>Download patch</a>
      <Button variant="outline" size="sm" disabled={operationCount === 0} onclick={() => studio.reset()}>Reset</Button>
    </div>
    <p class="min-h-4 text-[12px]" role="status" aria-live="polite">{status}</p>
  </section>
</div>
