import { describe, expect, it } from 'vitest';
import { DECK_LAYOUTS } from '../src/layouts/index.ts';
import { type Deck, DeckSchema } from '../src/schema/index.ts';
import { deckOutline, deckToMarkdown, formatDeckOutline, slideTitle } from '../src/text/index.ts';

/**
 * The text twins of a Protoyard deck are `@texuli/deck`'s (`deckToText`,
 * `deckOutline`) on the migrated deck; their formatting is tested in Texuli.
 * These check the Protoyard adapter: options pass through, hidden slides and
 * notes behave as documented, every layout sample renders, and hostile
 * strings stay inert text.
 */
const RLO = String.fromCodePoint(0x202e);

function deck(): Deck {
  return DeckSchema.parse({
    style: {},
    outline: {
      title: 'Quarterly review',
      sections: [{ id: 'main', title: 'Main', slideIds: ['cover', 'plan', 'secret'] }],
    },
    slides: [
      {
        id: 'cover',
        layout: 'title-hero',
        props: { title: 'Quarterly review', subtitle: 'Fictional figures' },
        notes: 'Welcome everyone and set the agenda for the next twenty minutes.',
      },
      {
        id: 'plan',
        title: 'The plan',
        layout: 'free',
        blocks: [
          { type: 'heading', text: 'The plan', level: 2 },
          { type: 'text', markdown: 'Ship the **pilot** on Friday.' },
        ],
      },
      {
        id: 'secret',
        title: 'Backup slide',
        layout: 'big-stat',
        hidden: true,
        props: { number: '42', label: 'backup answers' },
      },
    ],
  });
}

describe('deckToMarkdown', () => {
  it('is deterministic, titled by the outline and ends with one newline', () => {
    const text = deckToMarkdown(deck());
    expect(deckToMarkdown(deck())).toBe(text);
    expect(text.startsWith('# Quarterly review')).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).toContain('Ship the **pilot** on Friday.');
  });

  it('includes notes by default and can leave them out', () => {
    expect(deckToMarkdown(deck())).toContain('set the agenda');
    expect(deckToMarkdown(deck(), { notes: false })).not.toContain('set the agenda');
  });

  it('skips hidden slides unless asked', () => {
    expect(deckToMarkdown(deck())).not.toContain('backup answers');
    expect(deckToMarkdown(deck(), { includeHidden: true })).toContain('backup answers');
  });

  it('renders every catalog layout sample with its slide title', () => {
    for (const layout of DECK_LAYOUTS) {
      const slide =
        layout.id === 'free'
          ? {
              id: 'a',
              title: `The ${layout.id} slide`,
              layout: 'free',
              ...(layout.sample as object),
            }
          : { id: 'a', title: `The ${layout.id} slide`, layout: layout.id, props: layout.sample };
      const text = deckToMarkdown(DeckSchema.parse({ style: {}, slides: [slide] }));
      expect(text, layout.id).toContain(`The ${layout.id} slide`);
    }
  });

  it('keeps hostile strings inert: no raw HTML, no script link, no invisible controls', () => {
    // Unvalidated on purpose (the schema refuses the bidi override): the twin must stay inert anyway.
    const hostile = {
      style: {},
      slides: [
        {
          id: 'x',
          layout: 'free',
          blocks: [
            { type: 'heading', text: `<script>alert(1)</script> Pay ${RLO}gnp.exe`, level: 2 },
            { type: 'text', markdown: '[click](javascript:alert(1)) <img src=x onerror=alert(1)>' },
          ],
        },
      ],
    } as unknown as Deck;
    const text = deckToMarkdown(hostile);
    // Tags are escaped (`\<script\>`), never raw.
    expect(text).not.toMatch(/(?<!\\)<(?:script|img)/i);
    expect(text).toContain('\\<script\\>');
    expect(text).not.toContain(RLO);
  });

  // `@texuli/deck`'s text twin drops unsafe link targets (Protoyard's former twin
  // re-serialized links from a safe AST and had the same guarantee).
  it('never keeps a javascript: link as link syntax', () => {
    const hostile = {
      style: {},
      slides: [
        {
          id: 'x',
          layout: 'free',
          blocks: [{ type: 'text', markdown: '[click](javascript:alert(1))' }],
        },
      ],
    } as unknown as Deck;
    expect(deckToMarkdown(hostile)).not.toMatch(/\]\(javascript:/i);
  });
});

describe('deckOutline', () => {
  it('lists every slide (hidden ones flagged) and formats one line per slide', () => {
    const outline = deckOutline(deck());
    expect(outline.title).toBe('Quarterly review');
    expect(outline.slides.map((slide) => [slide.id, slide.layout, slide.hidden])).toEqual([
      ['cover', 'title-hero', false],
      ['plan', 'free', false],
      ['secret', 'big-stat', true],
    ]);
    const lines = formatDeckOutline(outline).split('\n');
    expect(lines[0]).toBe('1. cover · title-hero · Quarterly review');
    expect(lines[2]).toMatch(/\(hidden\)$/);
  });

  it('takes a slide title from the slide, else its first heading', () => {
    const [cover, plan] = deck().slides;
    expect(slideTitle(plan as never)).toBe('The plan');
    expect(slideTitle({ ...(cover as object), title: undefined } as never)).toBe(
      'Quarterly review'
    );
  });
});
