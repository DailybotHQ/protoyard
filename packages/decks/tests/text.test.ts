import { type MdBlock, type MdInline, parseMarkdown } from '@protoyard/ai/markdown';
import { describe, expect, it } from 'vitest';
import { getDeckLayout } from '../src/layouts/catalog.ts';
import { type Deck, DeckSchema } from '../src/schema/index.ts';
import {
  deckOutline,
  deckToMarkdown,
  escapeInline,
  escapeText,
  formatDeckOutline,
  richText,
  slideTitle,
} from '../src/text/index.ts';

const deck = (input: unknown): Deck => DeckSchema.parse(input);

/** A small fictional deck that touches every kind of text the twin emits. */
const FIXTURE = deck({
  style: { theme: 'violet', motion: 'full' },
  outline: {
    title: 'Northwind launch review',
    sections: [
      { id: 'why', title: 'Why now', slideIds: ['intro', 'problem'] },
      { id: 'numbers', title: 'Numbers', slideIds: ['growth', 'plans', 'demo'] },
    ],
  },
  slides: [
    {
      id: 'intro',
      layout: 'title-hero',
      props: {
        title: 'Northwind launch review',
        subtitle: 'Fictional data, Q3 2026',
        meta: 'Product team',
      },
      notes: 'Open with the one-line summary.\n\nKeep it under a minute.',
    },
    {
      id: 'problem',
      layout: 'two-column-split',
      title: 'The problem',
      props: {
        left: { heading: 'Today', body: 'Support answers in 4 hours.' },
        right: { heading: 'Goal', body: 'Answer in under 2 hours.' },
      },
    },
    {
      id: 'growth',
      layout: 'chart',
      props: {
        title: 'Tickets per month',
        spec: {
          kind: 'bar',
          title: 'Tickets per month',
          labels: ['July', 'August', 'September'],
          series: [
            { label: 'Opened', values: [1080, 1150, 1240] },
            { label: 'Closed', values: [1050, 1130.5, null] },
          ],
        },
      },
      notes: 'September closed count is still being reconciled.',
    },
    {
      id: 'plans',
      layout: 'comparison-table',
      props: {
        title: 'Plans compared',
        columns: ['Starter', 'Team'],
        rows: [
          { label: 'Seats', values: ['1', '10'] },
          { label: 'SSO', values: [false, true] },
          { label: 'Support', values: ['Email', null] },
        ],
      },
    },
    {
      id: 'demo',
      layout: 'free',
      title: 'How it works',
      blocks: [
        { type: 'text', markdown: 'Three steps, **no setup**:\n\n1. Import\n2. Review\n3. Ship' },
        { type: 'code', lang: 'ts', code: 'const answer = 42;', highlights: ['1'] },
        { type: 'callout', title: 'Note', body: 'Everything here is *simulated*.' },
      ],
    },
    { id: 'secret', layout: 'quote', hidden: true, props: { quote: 'Hidden slide' } },
    {
      id: 'close',
      layout: 'closing-cta',
      props: {
        title: 'Thanks',
        text: 'Questions welcome.',
        cta: { label: 'Read the report', href: 'https://example.com/report' },
      },
    },
  ],
});

describe('deckToMarkdown', () => {
  it('matches the fixture snapshot (titles, sections, props, chart table, notes)', () => {
    expect(deckToMarkdown(FIXTURE)).toMatchSnapshot();
  });

  it('is deterministic and ends with one newline', () => {
    const first = deckToMarkdown(FIXTURE);
    expect(deckToMarkdown(structuredClone(FIXTURE))).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
    expect(first.endsWith('\n\n')).toBe(false);
  });

  it('summarizes charts as a table, one row per label and one column per series', () => {
    const md = deckToMarkdown(FIXTURE);
    expect(md).toContain('*Chart (bar): Tickets per month*');
    expect(md).toContain('|  | Opened | Closed |'.replace('|  |', '|   |'));
    expect(md).toContain('| July | 1080 | 1050 |');
    expect(md).toContain('| August | 1150 | 1130.5 |');
    expect(md).toContain('| September | 1240 |   |');
  });

  it('puts notes under a "Notes" heading, and can leave them out', () => {
    const md = deckToMarkdown(FIXTURE);
    expect(md).toContain('#### Notes\n\nOpen with the one-line summary.');
    expect(deckToMarkdown(FIXTURE, { notes: false })).not.toContain('Notes');
  });

  it('skips hidden slides unless asked, and numbers the listed slides', () => {
    expect(deckToMarkdown(FIXTURE)).not.toContain('Hidden slide');
    const all = deckToMarkdown(FIXTURE, { includeHidden: true });
    expect(all).toContain('### 6. Hidden slide');
    expect(all).toContain('### 7. Thanks');
  });

  it('uses ## slides and the given title when the deck has no outline', () => {
    const plain = deck({
      style: {},
      slides: [{ id: 'only', layout: 'big-stat', props: { number: '18%', label: 'Growth' } }],
    });
    expect(deckToMarkdown(plain, { title: 'Stats' })).toBe(
      '# Stats\n\n## 1. 18%\n\n**18%** Growth\n'
    );
    expect(deckToMarkdown(plain).startsWith('# Deck\n')).toBe(true);
  });

  it('falls back to every prop string for unknown layouts or props that fail their schema', () => {
    const odd = deck({
      style: {},
      slides: [
        { id: 'custom', layout: 'my-layout', props: { headline: 'Hi', items: ['a', 'b'], n: 3 } },
        { id: 'broken', layout: 'big-stat', props: { label: 'Missing number' } },
      ],
    });
    const md = deckToMarkdown(odd);
    expect(md).toContain('*Layout `my-layout`*');
    expect(md).toContain('- headline: Hi\n- items.1: a\n- items.2: b\n- n: 3');
    expect(md).toContain('- label: Missing number');
  });

  it('renders every catalog layout sample without throwing and with its title', () => {
    for (const id of [
      'title-hero',
      'section-divider',
      'two-column-split',
      'three-column-cards',
      'image-left',
      'image-right',
      'image-centered',
      'image-full-bleed',
      'quote',
      'code-with-callout',
      'big-stat',
      'comparison-table',
      'process-steps',
      'timeline',
      'team-avatars',
      'closing-cta',
      'video-centered',
      'video-left',
      'video-right',
      'chart',
    ]) {
      const layout = getDeckLayout(id);
      expect(layout, id).toBeDefined();
      const md = deckToMarkdown(
        deck({ style: {}, slides: [{ id: 's', layout: id, props: layout?.sample }] })
      );
      expect(md, id).toMatch(/^# Deck\n\n## 1\. /);
      expect(md, id).not.toContain('*Layout `');
    }
  });
});

/** Every inline node of a parsed document, flattened. */
function inlines(blocks: readonly MdBlock[]): MdInline[] {
  const out: MdInline[] = [];
  const visit = (nodes: readonly MdInline[]) => {
    for (const node of nodes) {
      out.push(node);
      if ('children' in node) visit(node.children);
    }
  };
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') visit(block.children);
    if (block.type === 'quote') out.push(...inlines(block.children));
    if (block.type === 'list') for (const item of block.items) out.push(...inlines(item.children));
    if (block.type === 'table')
      for (const row of [block.header, ...block.rows]) for (const cell of row) visit(cell);
  }
  return out;
}

describe('hostile strings stay inert text', () => {
  const RLO = String.fromCodePoint(0x202e);
  const LRI = String.fromCodePoint(0x2066);
  const PDI = String.fromCodePoint(0x2069);
  const NUL = String.fromCodePoint(0);
  const ZWSP = String.fromCodePoint(0x200b);
  const hostile = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[click](javascript:alert(1))',
    '# Fake heading',
    '- fake item',
    '1. fake ordered',
    '> fake quote',
    '```\nbreak out of a fence\n```',
    '| a | b |',
    '&#60;script&#62;',
    `admin${RLO}txt.exe`,
    `${LRI}isolate${PDI}`,
    `nul${NUL}byte`,
    `zero${ZWSP}width`,
    '![x](https://evil.example.com/pixel.png)',
    '**bold** _under_ ~~strike~~ `code`',
  ];
  // The blocks schema already rejects control and bidi characters in block
  // text; layout props and notes are where they can still arrive.
  const printable = hostile.filter((text) => ![RLO, LRI, NUL, ZWSP].some((c) => text.includes(c)));

  const attack = deck({
    style: {},
    outline: { title: hostile[0], sections: [{ id: 'a', title: hostile[3], slideIds: ['one'] }] },
    slides: [
      {
        id: 'one',
        layout: 'two-column-split',
        title: hostile[2],
        props: {
          left: { heading: hostile[4], body: hostile.join('\n') },
          right: { heading: hostile[10], body: hostile[7] as string },
        },
        notes: hostile.join('\n'),
      },
      {
        id: 'two',
        layout: 'comparison-table',
        props: {
          title: hostile[8],
          columns: [hostile[8], hostile[0]],
          rows: [
            { label: hostile[3], values: [hostile[1], hostile[2]] },
            { label: 'b', values: ['x', 'y'] },
            { label: 'c', values: ['x', 'y'] },
          ],
        },
      },
      {
        id: 'three',
        layout: 'free',
        blocks: [
          { type: 'text', markdown: printable.join('\n\n') },
          { type: 'heading', text: hostile[0] as string },
          {
            type: 'cta',
            actions: [{ label: hostile[0] as string, href: 'https://example.com/ok' }],
          },
          { type: 'code', lang: 'ts', code: '```\nconst x = 1;\n````' },
        ],
      },
      {
        id: 'four',
        layout: 'closing-cta',
        props: { title: 'Bye', cta: { label: 'Bad link', href: 'javascript:alert(1)' } },
      },
    ],
  });
  const md = deckToMarkdown(attack);
  const doc = parseMarkdown(md);

  it('emits no raw HTML tag, entity or invisible control character', () => {
    expect(md).not.toMatch(/(?<!\\)<(?:script|img|\/)/i);
    expect(md).not.toMatch(/(?<!\\)&#/);
    for (const code of [0, 0x200b, 0x202e, 0x2066, 0x2069]) {
      expect(md.includes(String.fromCodePoint(code))).toBe(false);
    }
    // The visible text survives, minus the invisible characters.
    expect(md).toContain('admintxt\\.exe'.replace('\\.', '.'));
    expect(md).toContain('nulbyte');
  });

  it('only links to the allowed https target; javascript: never becomes a link', () => {
    const links = inlines(doc.blocks).filter((node) => node.type === 'link');
    expect(links.map((node) => (node as { href: string }).href)).toEqual([
      'https://example.com/ok',
    ]);
    expect(md).toContain('Bad link');
    expect(md).not.toMatch(/(?<!\\)\]\(javascript:/i);
    // Remote images in author text never become images.
    expect(inlines(doc.blocks).some((node) => node.type === 'image')).toBe(false);
  });

  it('keeps structure to what the deck defines: plain "#" text never becomes a heading', () => {
    const headings = doc.blocks.filter((block) => block.type === 'heading');
    const fake = headings.filter((heading) =>
      inlines([heading])
        .map((n) => ('text' in n ? n.text : ''))
        .join('')
        .startsWith('Fake heading')
    );
    // Only the author's own Markdown heading (in the free slide's text block)
    // is a heading, demoted below the slide heading; titles, props and notes
    // that start with "#" stay text.
    expect(fake.map((heading) => heading.type === 'heading' && heading.level)).toEqual([4]);
    expect(md).toContain('## \\# Fake heading');
    expect(md).toContain('\\# Fake heading');
    expect(md).toContain('\\- fake item');
    expect(md).toContain('1\\. fake ordered');
    expect(md).toContain('\\> fake quote');
  });

  it('keeps table cells inside their table and code inside a longer fence', () => {
    const tables = doc.blocks.filter((block) => block.type === 'table');
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      if (t.type !== 'table') continue;
      for (const row of t.rows) expect(row.length).toBe(t.header.length);
    }
    expect(md).toContain('`````ts\n```\nconst x = 1;\n````\n`````');
  });

  it('re-serializes author Markdown from the safe AST (formatting kept, HTML escaped)', () => {
    expect(richText('**bold** and <b>raw</b> [ok](https://example.com) [bad](javascript:x)')).toBe(
      '**bold** and \\<b\\>raw\\</b\\> [ok](https://example.com) [bad](javascript:x)'.replace(
        '[bad](javascript:x)',
        richText('[bad](javascript:x)')
      )
    );
    expect(richText('[bad](javascript:x)')).not.toMatch(/\]\(/);
    expect(richText('# Title', 2)).toBe('### Title');
    expect(richText('- [x] done\n- [ ] todo')).toBe('- [x] done\n- [ ] todo');
  });

  it('escapes plain text by context', () => {
    expect(escapeInline('a | b <c> & `d` *e* [f]')).toBe(
      'a \\| b \\<c\\> \\& \\`d\\` \\*e\\* \\[f\\]'
    );
    expect(escapeInline('1. not a list')).toBe('1\\. not a list');
    expect(escapeInline('version 1.2 - ok')).toBe('version 1.2 - ok');
    expect(escapeText('line one\n\n\n\n# two')).toBe('line one\n\n\\# two');
  });
});

describe('deckOutline', () => {
  it('lists id, layout and title per slide, with sections and hidden flags', () => {
    expect(deckOutline(FIXTURE)).toEqual({
      title: 'Northwind launch review',
      slides: [
        {
          number: 1,
          id: 'intro',
          layout: 'title-hero',
          title: 'Northwind launch review',
          section: 'why',
          hidden: false,
        },
        {
          number: 2,
          id: 'problem',
          layout: 'two-column-split',
          title: 'The problem',
          section: 'why',
          hidden: false,
        },
        {
          number: 3,
          id: 'growth',
          layout: 'chart',
          title: 'Tickets per month',
          section: 'numbers',
          hidden: false,
        },
        {
          number: 4,
          id: 'plans',
          layout: 'comparison-table',
          title: 'Plans compared',
          section: 'numbers',
          hidden: false,
        },
        {
          number: 5,
          id: 'demo',
          layout: 'free',
          title: 'How it works',
          section: 'numbers',
          hidden: false,
        },
        {
          number: 6,
          id: 'secret',
          layout: 'quote',
          title: 'Hidden slide',
          section: null,
          hidden: true,
        },
        {
          number: 7,
          id: 'close',
          layout: 'closing-cta',
          title: 'Thanks',
          section: null,
          hidden: false,
        },
      ],
    });
    expect(deckOutline(FIXTURE, { includeHidden: false }).slides.map((s) => s.id)).not.toContain(
      'secret'
    );
  });

  it('formats as one line per slide', () => {
    expect(formatDeckOutline(deckOutline(FIXTURE))).toBe(
      [
        '1. intro · title-hero · Northwind launch review',
        '2. problem · two-column-split · The problem',
        '3. growth · chart · Tickets per month',
        '4. plans · comparison-table · Plans compared',
        '5. demo · free · How it works',
        '6. secret · quote · Hidden slide (hidden)',
        '7. close · closing-cta · Thanks',
      ].join('\n')
    );
  });

  it('derives titles from the slide, the layout props, the first heading or a short quote', () => {
    const titled = deck({
      style: {},
      slides: [
        { id: 'a', layout: 'free', blocks: [{ type: 'heading', text: 'From heading' }] },
        { id: 'b', layout: 'free', blocks: [{ type: 'text', markdown: 'no heading' }] },
        { id: 'c', layout: 'quote', props: { quote: 'x'.repeat(80) } },
      ],
    });
    expect(titled.slides.map(slideTitle)).toEqual(['From heading', null, `${'x'.repeat(59)}…`]);
  });
});
