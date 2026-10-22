import { loadBlockFamily } from '@protoyard/blocks-ui';
import { DECK_LAYOUT_IDS, getDeckLayout, slidePositionCount } from '@protoyard/decks';
import { DECK_LAYOUT_STEPPABLE } from '@protoyard/decks/layouts';
import { type DeckSlide, safeParseDeck } from '@protoyard/decks/schema';
import { cleanup, configure, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLayoutRenderer } from '../src/layouts/registry.ts';
import SteppedSlideHarness from './fixtures/SteppedSlideHarness.svelte';

/**
 * Every stepped catalog prop hides before its step and shows at it
 * (PLAN_006 T-steps-everywhere): the props object itself (the whole slide
 * body), media, code, the CTA, the chart and every list item, each through
 * the same `data-py-fragment` attributes the slide frame's CSS hides.
 */

configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });
afterEach(cleanup);

// Every catalog layout loads two lazy levels: its layout family, then (for the
// layouts that render shared blocks, like team-avatars' people grid) a blocks-ui
// family. Cold, under the full parallel suite, those transforms could outlast a
// test's wait. Load them all once here, so each test only waits for rendering.
beforeAll(async () => {
  await Promise.all([
    ...DECK_LAYOUT_IDS.map((layout) => loadLayoutRenderer(layout)),
    ...(['text', 'media', 'data', 'structure', 'code'] as const).map((family) =>
      loadBlockFamily(family)
    ),
  ]);
}, 120_000);

/** The sample of `layout` with a marker on `pattern` (`*` is item 1). */
function stepped(layout: string, pattern: string): DeckSlide {
  const props = structuredClone(getDeckLayout(layout)?.sample ?? {}) as Record<string, unknown>;
  const marker = { step: 1, fragment: 'fade-up' };
  if (pattern === '') Object.assign(props, marker);
  else {
    const [key = '', star] = pattern.split('.');
    const target = star ? (props[key] as Record<string, unknown>[])[1] : props[key];
    Object.assign(target as object, marker);
  }
  const parsed = safeParseDeck({ style: {}, slides: [{ id: 'one', layout, props }] });
  if (!parsed.success) throw new Error(`${layout} ${pattern}: ${JSON.stringify(parsed.issues)}`);
  return parsed.deck?.slides[0] as DeckSlide;
}

const fragments = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-py-fragment-kind="prop"]'),
];

const CASES = DECK_LAYOUT_IDS.filter((id) => id !== 'free').flatMap((layout) =>
  (DECK_LAYOUT_STEPPABLE[layout as keyof typeof DECK_LAYOUT_STEPPABLE] ?? []).map(
    (pattern) => [layout, pattern || '(props)'] as const
  )
);

describe('stepped catalog props', () => {
  it.each(CASES)(
    '%s: a marker on %s hides it before its step and shows it at it',
    async (layout, label) => {
      const pattern = label === '(props)' ? '' : label;
      const slide = stepped(layout, pattern);
      const last = slidePositionCount(slide) - 1;
      expect(last).toBe(1);

      const before = render(SteppedSlideHarness, { slide, step: 0 });
      await waitFor(() => expect(fragments(before.container)).toHaveLength(1));
      const [hidden] = fragments(before.container);
      expect(hidden?.dataset.pyFragment).toBe('hidden');
      expect(hidden?.getAttribute('aria-hidden')).toBe('true');
      expect(hidden?.hasAttribute('inert')).toBe(true);
      expect(hidden?.dataset.pyFragmentReveal).toBe('fade-up');
      if (pattern === '') expect(hidden?.matches('[data-py-deck-layout]')).toBe(true);
      // The stepped element holds the content it reveals.
      expect(
        hidden?.textContent?.trim().length || hidden?.querySelector('img, video, svg, canvas')
      ).toBeTruthy();
      before.unmount();

      const after = render(SteppedSlideHarness, { slide, step: last });
      await waitFor(() => expect(fragments(after.container)).toHaveLength(1));
      const [shown] = fragments(after.container);
      expect(shown?.dataset.pyFragment).toBe('shown');
      expect(shown?.hasAttribute('aria-hidden')).toBe(false);
      expect(shown?.hasAttribute('inert')).toBe(false);
    }
  );

  it('team-avatars: only the stepped person hides, inside the shared people grid', async () => {
    const slide = stepped('team-avatars', 'people.*');
    const { container } = render(SteppedSlideHarness, { slide, step: 0 });
    await waitFor(() => expect(fragments(container)).toHaveLength(1));
    const people = [...container.querySelectorAll('[data-slot="people"] li')];
    expect(people.length).toBeGreaterThan(1);
    expect(people.map((person) => person.getAttribute('data-py-fragment'))).toEqual(
      people.map((_, index) => (index === 1 ? 'hidden' : null))
    );
  });

  it('layouts without markers render no fragment attributes', async () => {
    for (const layout of ['big-stat', 'closing-cta', 'image-centered', 'chart']) {
      const parsed = safeParseDeck({
        style: {},
        slides: [{ id: 'plain', layout, props: getDeckLayout(layout)?.sample }],
      });
      const slide = parsed.deck?.slides[0] as DeckSlide;
      const { container, unmount } = render(SteppedSlideHarness, { slide, step: 0 });
      await waitFor(() => expect(container.querySelector('[data-py-deck-layout]')).not.toBeNull());
      expect(fragments(container), layout).toEqual([]);
      unmount();
    }
  });
});
