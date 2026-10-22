import { DECK_TEXT_MINIMUMS } from '@protoyard/decks';
import { DECK_LAYOUTS } from '@protoyard/decks/layouts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fitFontSize, fitScale, keepsZoom, textOverflows } from '../src/layouts/design/fit.ts';
import { DECK_TYPE, DECK_TYPE_STEPS, typeSize } from '../src/layouts/design/scale.ts';
import { loadLayoutRenderer } from '../src/layouts/registry.ts';

/**
 * Each catalog layout has its own slide composition (AC-deck-layout-design):
 * a display type scale, real grids and connectors, and a chart whose table
 * stays behind its toggle. happy-dom lays nothing out, so these tests check
 * structure and classes; the visual pass is screenshots of the flagship deck.
 */

// happy-dom has no layout: give charts a width the way a browser would.
class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 960, height: 300 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', FixedWidthObserver);
  // Warm the lazy layout chunks and the block families these tests read (text,
  // data). Structure checks never wait for the media family, whose first cold
  // transform is slow and would starve other suites running in parallel.
  await Promise.all([
    ...['title-hero', 'image-left', 'big-stat', 'timeline'].map((id) => loadLayoutRenderer(id)),
    import('@protoyard/blocks-ui/text'),
    import('@protoyard/blocks-ui/data'),
  ]);
}, 120_000);

afterEach(() => cleanup());

const sample = (id: string) => DECK_LAYOUTS.find((entry) => entry.id === id)?.sample;

async function renderLayout(id: string, props: unknown = sample(id), settle = false) {
  const Renderer = await loadLayoutRenderer(id);
  if (!Renderer) throw new Error(`no renderer for ${id}`);
  const view = render(Renderer, { props: { layout: id, props } });
  await waitFor(() =>
    expect(view.container.querySelector(`[data-py-deck-design="${id}"]`)).toBeTruthy()
  );
  const root = view.container.querySelector(`[data-py-deck-design="${id}"]`) as HTMLElement;
  // Blocks load their family chunk lazily; tests that read block output wait for it.
  if (settle) {
    await waitFor(() => expect(root.querySelector('[aria-label="Loading block"]')).toBeNull(), {
      timeout: 4000,
    });
  }
  return root;
}

/** The composition's skeleton: its named slots in document order, plus the media element kind. */
function signature(root: HTMLElement): string {
  const slots = [...root.querySelectorAll('[data-slot]')].map((el) => el.getAttribute('data-slot'));
  const media = root.querySelector('[data-slot="media"]')?.getAttribute('data-media') ?? '';
  return `${slots.join('>')}|${media}`;
}

describe('the slide type scale', () => {
  it('matches the numbers in DECK_TYPE_STEPS and never goes below the deck minimums', () => {
    for (const [name, step] of Object.entries(DECK_TYPE_STEPS)) {
      expect(DECK_TYPE[name as keyof typeof DECK_TYPE]).toContain(
        `text-[length:clamp(${step.minPx}px,${step.cqw}cqw,${step.maxPx}px)]`
      );
      const floor =
        name === 'label' || name === 'caption'
          ? DECK_TEXT_MINIMUMS.labelPx
          : DECK_TEXT_MINIMUMS.bodyPx;
      expect(step.minPx, name).toBeGreaterThanOrEqual(floor);
    }
  });

  it('puts cover, divider and big-stat text at display size on a 1280 px stage', () => {
    expect(typeSize('display', 1280)).toBe(96);
    expect(typeSize('stat', 1280)).toBe(192);
    expect(typeSize('title', 1280)).toBeCloseTo(53.76);
    expect(typeSize('body', 1280)).toBe(26.88);
    // Narrow stages clamp to the floor; very wide ones to the ceiling.
    expect(typeSize('display', 720)).toBe(56);
    expect(typeSize('display', 4000)).toBe(112);
    expect(typeSize('display', 1280)).toBeGreaterThan(typeSize('title', 1280) * 1.6);
    expect(typeSize('stat', 1280)).toBeGreaterThan(typeSize('display', 1280) * 1.8);
  });
});

describe('each catalog layout has its own composition', () => {
  it('renders all 21 layouts with a distinct structure, no invalid-content notes', async () => {
    const signatures = new Map<string, string>();
    for (const entry of DECK_LAYOUTS) {
      const root = await renderLayout(entry.id);
      expect(root.getAttribute('data-py-deck-layout'), entry.id).toBe(entry.id);
      expect(root.querySelector('[role="note"]'), entry.id).toBeNull();
      const sig = signature(root);
      expect(sig.length, entry.id).toBeGreaterThan(1);
      signatures.set(entry.id, sig);
      cleanup();
    }
    expect(signatures.size).toBe(21);
    const duplicates = [...signatures].filter(([id, sig]) =>
      [...signatures].some(([other, s]) => other !== id && s === sig)
    );
    expect(duplicates).toEqual([]);
  });

  it('sets cover and divider titles and the big-stat number on the display scale', async () => {
    const cover = await renderLayout('title-hero', {
      title: 'Launch',
      subtitle: 'Why now',
      meta: 'Q3',
    });
    const h1 = within(cover).getByRole('heading', { level: 1, name: 'Launch' });
    expect(h1.className).toContain(DECK_TYPE.display);
    expect(cover.querySelector('[data-slot="subtitle"]')?.className).toContain(DECK_TYPE.lead);
    expect(cover.querySelector('[data-slot="meta"]')?.className).toContain(DECK_TYPE.label);
    cleanup();

    const divider = await renderLayout('section-divider', {
      eyebrow: 'Chapter 02',
      title: 'Results',
    });
    expect(within(divider).getByRole('heading', { level: 1, name: 'Results' }).className).toContain(
      DECK_TYPE.display
    );
    expect(divider.querySelector('[data-slot="eyebrow"]')?.textContent).toBe('Chapter 02');
    cleanup();

    const stat = await renderLayout('big-stat', {
      number: '3x',
      label: 'faster',
      source: 'Example study',
    });
    expect(stat.querySelector('[data-slot="number"]')?.className).toContain(DECK_TYPE.stat);
    expect(stat.querySelector('[data-slot="source"]')?.textContent).toBe('Source: Example study');
  });

  it('sets the quote as a pull quote with a decorative mark', async () => {
    const quote = await renderLayout('quote', { quote: 'Show the thing.', cite: 'A principle' });
    expect(quote.querySelector('blockquote')?.className).toContain(DECK_TYPE.quote);
    expect(quote.querySelector('[data-slot="mark"]')?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(quote.querySelector('[data-slot="cite"]')?.textContent).toContain('A principle');
  });

  it('joins process steps with connectors and numbers them', async () => {
    const steps = await renderLayout('process-steps', {
      title: 'How',
      steps: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }, { title: 'Four' }],
    });
    expect(steps.querySelectorAll('[data-slot="step"]')).toHaveLength(4);
    expect(steps.querySelectorAll('[data-slot="connector"]')).toHaveLength(3);
    expect(steps.querySelector('ol')?.getAttribute('style')).toContain('repeat(4,minmax(0,1fr))');
  });

  it('puts up to five timeline events on one axis and splits six to eight into two', async () => {
    const events = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ time: `Q${i + 1}`, text: `Event ${i + 1}` }));
    const five = await renderLayout('timeline', { title: 'Five', events: events(5) });
    expect(five.querySelectorAll('[data-slot="axis"]')).toHaveLength(1);
    expect(five.querySelectorAll('[data-slot="marker"]')).toHaveLength(5);
    cleanup();
    const eight = await renderLayout('timeline', { title: 'Eight', events: events(8) });
    const axes = eight.querySelectorAll('[data-slot="axis"]');
    expect(axes).toHaveLength(2);
    expect([...axes].map((axis) => axis.querySelectorAll('[data-slot="event"]').length)).toEqual([
      4, 4,
    ]);
  });

  it('sizes the comparison table for a room and names yes, no and empty cells', async () => {
    const table = await renderLayout('comparison-table', {
      title: 'Plans',
      columns: ['Starter', 'Team'],
      rows: [
        { label: 'SSO', values: [false, true] },
        { label: 'Seats', values: ['1', '10'] },
        { label: 'Support', values: ['Email', null] },
      ],
    });
    expect(within(table).getByRole('table').className).toContain(DECK_TYPE.body);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent?.trim())
    ).toEqual(['Starter', 'Team']);
    const cells = [...table.querySelectorAll('td[data-value]')].map((td) => [
      td.getAttribute('data-value'),
      td.textContent?.replace(/\s+/g, ' ').trim(),
    ]);
    expect(cells).toEqual([
      ['no', '✕No'],
      ['yes', '✓Yes'],
      ['text', '1'],
      ['text', '10'],
      ['text', 'Email'],
      ['none', '—Not applicable'],
    ]);
  });

  it('puts image-left media first and image-right copy first in reading order', async () => {
    const image = { src: 'assets/cover.webp', alt: 'A cover', width: 640, height: 480 };
    const left = await renderLayout('image-left', { image, heading: 'Left', body: 'Copy' });
    expect(signature(left).startsWith('media>')).toBe(true);
    cleanup();
    const right = await renderLayout('image-right', { image, heading: 'Right', body: 'Copy' });
    expect(signature(right).startsWith('copy>')).toBe(true);
    expect(right.querySelector('[data-slot="media"]')?.getAttribute('data-media')).toBe('image');
  });

  it('shows team cards with avatars in a grid sized to the team', async () => {
    const team = await renderLayout('team-avatars', {
      title: 'Team',
      people: [
        { name: 'Ada Example', role: 'Product', avatar: 'av-001' },
        { name: 'Marco Example', role: 'Design' },
        { name: 'Lena Example', role: 'Engineering' },
      ],
    });
    const people = team.querySelector('[data-slot="people"]') as HTMLElement;
    expect(people.style.getPropertyValue('--deck-team-columns').trim()).toBe('3');
    expect(people.querySelector('[data-py-block-renderer]')).toBeTruthy();
  });
});

describe('the chart layout', () => {
  const spec = {
    kind: 'line',
    title: 'Weekly prototypes',
    labels: ['W1', 'W2', 'W3'],
    series: [{ label: 'Decks', values: [4, 9, 15] }],
  };

  it('keeps the data table behind the chart toggle even when showTable is set, and prints it', async () => {
    const chart = await renderLayout('chart', { title: 'Growth', spec, showTable: true }, true);
    const slot = chart.querySelector('[data-slot="chart"]') as HTMLElement;
    const toggle = await within(slot).findByRole(
      'button',
      { name: 'View as table' },
      { timeout: 4000 }
    );
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    // No open table on the slide: the block's own showTable copy is never rendered.
    expect(within(slot).queryByRole('region', { name: 'Weekly prototypes (table)' })).toBeNull();
    // A print-only copy (display: none on screen) carries the same data to paper.
    const printTable = chart.querySelector('[data-slot="print-table"]') as HTMLElement;
    expect(printTable.tagName).toBe('TABLE');
    expect([...printTable.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual([
      'W1',
      'W2',
      'W3',
    ]);
    expect([...printTable.querySelectorAll('tbody td')].map((td) => td.textContent)).toEqual([
      '4',
      '9',
      '15',
    ]);
  });

  it('draws the series (free-text labels sit on a category axis)', async () => {
    const chart = await renderLayout('chart', { title: 'Growth', spec }, true);
    await waitFor(
      () => {
        const drawn = [...chart.querySelectorAll('[data-slot="chart"] path[d]')]
          .map((path) => path.getAttribute('d') ?? '')
          .filter((d) => d.length > 0 && !d.includes('NaN'));
        expect(drawn.length).toBeGreaterThan(0);
      },
      { timeout: 4000 }
    );
  });
});

describe('content fits the stage', () => {
  it('fitScale zooms only what overflows, down to a floor', () => {
    expect(fitScale(600, 600, 0.72)).toBe(1);
    expect(fitScale(601, 600, 0.72)).toBe(1); // rounding never shrinks a slide
    expect(fitScale(800, 600, 0.72)).toBe(0.75);
    expect(fitScale(2000, 600, 0.72)).toBe(0.72);
    expect(fitScale(0, 600, 0.72)).toBe(1); // not laid out yet
    expect(fitScale(800, 0, 0.72)).toBe(1);
  });

  it('keeps a zoom that still fits on a resize, so a slide never flips between two fits', () => {
    // Regression (deck design gate, flagship quiz slide under reduced motion):
    // re-measuring with the zoom reset read a layout sized for the zoomed width,
    // dropped the zoom, and flipped back a frame later, every two frames.
    const base = {
      applied: 0.843,
      reason: 'resize' as const,
      spaceChanged: false,
      fitsAtApplied: true,
    };
    expect(keepsZoom(base)).toBe(true);
    // Nothing applied yet, new content, a changed stage, or an overflow: measure again.
    expect(keepsZoom({ ...base, applied: 1 })).toBe(false);
    expect(keepsZoom({ ...base, reason: 'content' })).toBe(false);
    expect(keepsZoom({ ...base, spaceChanged: true })).toBe(false);
    expect(keepsZoom({ ...base, fitsAtApplied: false })).toBe(false);
  });

  it('fitFontSize steps down until the text fits, never below its minimum', () => {
    expect(fitFontSize(96, 56, (size) => size > 80)).toBeLessThanOrEqual(80);
    expect(fitFontSize(96, 56, (size) => size > 80)).toBeGreaterThan(70);
    expect(fitFontSize(96, 56, () => true)).toBe(56);
    expect(fitFontSize(96, 56, () => false)).toBe(96);
  });

  it('textOverflows ignores glyph overhang but catches a hidden line', () => {
    const box = (scrollHeight: number) => ({
      scrollHeight,
      clientHeight: 98,
      scrollWidth: 800,
      clientWidth: 800,
    });
    expect(textOverflows(box(104), 96)).toBe(false); // descenders on one tight line
    expect(textOverflows(box(196), 96)).toBe(true); // a clamped second line
  });

  it('clamps long titles to a few lines on every designed layout', async () => {
    const cover = await renderLayout('title-hero', { title: 'x'.repeat(100) });
    expect(cover.querySelector('h1')?.className).toContain('line-clamp-3');
  });
});

describe('untrusted props stay text', () => {
  it('never turns titles, labels or bodies into markup', async () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    const cover = await renderLayout('title-hero', { title: hostile, subtitle: hostile });
    expect(cover.querySelector('h1')?.textContent).toBe(hostile);
    expect(cover.querySelector('img, script')).toBeNull();
    cleanup();
    const split = await renderLayout(
      'two-column-split',
      {
        title: hostile,
        left: { heading: hostile, body: `**bold** ${hostile}` },
        right: { body: 'Plain' },
      },
      true
    );
    expect(split.querySelector('script, img')).toBeNull();
    expect(split.querySelector('[data-slot="left"] strong')?.textContent).toBe('bold');
  });

  it('shows a note instead of rendering props that fail their schema', async () => {
    const Renderer = await loadLayoutRenderer('big-stat');
    render(Renderer!, { props: { layout: 'big-stat', props: { number: '' } } });
    expect(await screen.findByRole('note')).toBeTruthy();
    expect(document.querySelector('[data-py-deck-design]')).toBeNull();
  });
});
