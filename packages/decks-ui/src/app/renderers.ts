import type { FreeSlide } from '@protoyard/decks/schema';
import { createDiagnostic, type DeckDiagnostic, type PathSegment } from '@texuli/deck/schema';
import { layoutRenderers } from '@texuli/slides/layouts';
import type { DeckRenderers } from '@texuli/slides/stage';

/**
 * Protoyard's renderer table for the `@texuli/slides` stage, which DeckApp
 * mounts with `defaultRenderers={false}`: every slide answers here, and the
 * stage's component registry (catalog components, which Protoyard decks do not
 * have) never loads.
 *
 * - `layout` slides paint with the stage's catalog layouts
 *   (`@texuli/slides/layouts`).
 * - `free` slides paint through `@protoyard/blocks-ui`, so interactive blocks
 *   keep their state in the host's `stateHost` (IndexedDB in a generated
 *   deck), `embed-app` mounts through the host's `mountEmbed`, and votes use
 *   the host's `viewerId`. Their blocks are `@protoyard/blocks` (poll, quiz,
 *   calculator, flow, terminal, form, embed-app…), so `validateBlock`
 *   replaces the stage's `@texuli/blocks` check (see `validateProtoyardBlock`).
 * - `custom` slides run the generated deck's own components
 *   (`src/custom-slides.ts`), with a labelled card in the player.
 *
 * Backgrounds, steps, chrome, overview, presenter and print are the stage's.
 * Every renderer is a lazy chunk.
 */
type Lazy = { load: () => Promise<unknown> };

const free: Lazy = { load: () => import('./FreeSlide.svelte') };
const custom: Lazy = { load: () => import('./CustomSlide.svelte') };

/**
 * The stage's free-slide block check for Protoyard blocks (step fields already
 * removed). DeckApp only receives a deck that passed `DeckSchema`, which
 * validates every block body with `@protoyard/blocks`; that zod schema is far
 * too large for the deck entry, so the stage checks only that each block is a
 * typed object (`@protoyard/blocks-ui` shows a labelled card for a type it
 * does not render). Returns no diagnostics to accept the block.
 */
export function validateProtoyardBlock(block: unknown, path: PathSegment[]): DeckDiagnostic[] {
  const typed =
    block !== null &&
    typeof block === 'object' &&
    !Array.isArray(block) &&
    typeof (block as { type?: unknown }).type === 'string' &&
    (block as { type: string }).type.length > 0;
  if (typed) return [];
  return [
    createDiagnostic('block-props', 'A free-slide block is an object with a "type".', path, {
      fix: 'Check the block against the @protoyard/blocks schema for its type.',
    }),
  ];
}

/** The renderer table for one deck (its free slides are looked up by id for prefetch). */
export function createProtoyardRenderers(
  freeSlides: ReadonlyMap<string, FreeSlide>
): DeckRenderers {
  return Object.freeze({
    layout: (slide, lookup) => layoutRenderers.layout?.(slide, lookup),
    free: () => free as never,
    custom: () => custom as never,
    validateBlock: validateProtoyardBlock,
    prefetch(slide) {
      if (slide.layout === 'custom') return custom.load();
      if (slide.layout !== 'free') return layoutRenderers.prefetch?.(slide);
      const original = freeSlides.get(slide.id);
      // The block families load from a lazy module, so the deck entry never carries blocks-ui.
      return Promise.all([
        free.load(),
        original
          ? import('./free-prefetch.ts').then((module) => module.prefetchFreeSlide(original))
          : undefined,
      ]);
    },
  } satisfies DeckRenderers);
}
