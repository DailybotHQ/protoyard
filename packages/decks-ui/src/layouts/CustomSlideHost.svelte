<script lang="ts">
import type { CustomSlide } from '@protoyard/decks/schema';
import { type CustomSlideRegistry, customSlideLoader, frozenCopy } from './custom-slides.ts';

/**
 * A `layout: "custom"` slide. In a generated deck (level 2) it loads the
 * component the prototype registered under `props.component` and renders it
 * with `{ slide, step, stepCount, data }`, inside the slide canvas. A
 * component that throws, or fails to load, shows an error card on this slide
 * only; the deck keeps navigating. Without a registry (the player, level 1)
 * or with `live` off (overview, print, previews) it shows a labelled card and
 * runs no owned code.
 */
let {
  slide,
  step = 0,
  stepCount = 0,
  registry,
  live = true,
}: {
  slide: CustomSlide;
  step?: number;
  stepCount?: number;
  /** The generated deck's `src/custom-slides.ts`; absent in the player. */
  registry?: CustomSlideRegistry | undefined;
  /** False in thumbnails and print: show the card, never run the component. */
  live?: boolean;
} = $props();

const id = $derived(slide.props.component);
const loader = $derived(customSlideLoader(registry, id));
const load = $derived(live && loader ? loader() : null);
const ownSlide = $derived(frozenCopy(slide));
const data = $derived(frozenCopy(slide.props.data ?? {}));
const label = $derived(slide.title ?? id);
</script>

{#snippet card(heading: string, detail: string, tone: 'info' | 'error' = 'info')}
  <div
    class="grid size-full place-items-center p-16"
    role={tone === 'error' ? 'alert' : 'note'}
    data-py-deck-custom-card={tone}
  >
    <div class="max-w-4xl rounded-2xl border-2 border-dashed border-border bg-muted/40 p-8 text-center">
      <p class="text-2xl font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p class={`mt-4 text-3xl font-semibold ${tone === 'error' ? 'text-destructive' : 'text-foreground'}`}>{heading}</p>
      <p class="mt-4 text-2xl text-muted-foreground">{detail}</p>
    </div>
  </div>
{/snippet}

<div class="size-full" data-py-deck-custom={id}>
  {#if !live}
    {@render card('Interactive slide', `Runs the "${id}" component on the slide itself.`)}
  {:else if !registry}
    {@render card(
      'Interactive slide — open the generated deck to run it',
      `This slide runs the "${id}" component, which only a generated deck has.`
    )}
  {:else if !loader}
    {@render card(
      'This custom slide is not available',
      `No component named "${id}" is registered in this deck's src/custom-slides.ts.`,
      'error'
    )}
  {:else if load}
    {#await load}
      <div class="grid size-full place-items-center" role="status" aria-label="Loading the slide">
        <span class="text-2xl text-muted-foreground">Loading the slide…</span>
      </div>
    {:then module}
      {@const Slide = module.default}
      <svelte:boundary>
        <!-- The component owns its clicks: they never advance the deck. -->
        <div class="size-full" data-py-deck-interactive>
          <Slide slide={ownSlide} {step} {stepCount} {data} />
        </div>
        {#snippet failed(_error, reset)}
          <div class="grid size-full place-items-center p-16" role="alert" data-py-deck-custom-card="error">
            <div class="max-w-4xl rounded-2xl border-2 border-destructive bg-background p-8 text-center">
              <p class="text-3xl font-semibold text-destructive">This slide stopped working</p>
              <p class="mt-4 text-2xl text-muted-foreground">The "{id}" component failed. The rest of the deck still works.</p>
              <button
                type="button"
                class="mt-6 min-h-11 rounded-md border border-border px-6 text-2xl font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onclick={reset}
              >
                Try again
              </button>
            </div>
          </div>
        {/snippet}
      </svelte:boundary>
    {:catch}
      {@render card(
        'This slide could not be loaded',
        `The "${id}" component did not load. The rest of the deck still works.`,
        'error'
      )}
    {/await}
  {/if}
</div>
