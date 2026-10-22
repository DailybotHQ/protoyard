// @vitest-environment node
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BLOCK_CONTENT_LIMITS,
  BLOCK_FAMILIES,
  BLOCK_TYPE_FAMILY,
  BLOCK_TYPES,
  type Block,
  base64DecodedBytes,
  type ColumnsBlock,
  ColumnsBlockSchema,
  classifyMediaSource,
  containerDepth,
  forEachBlock,
  MEDIA_DATA_URI_MAX_BYTES,
  parseLineSpec,
  STATIC_BLOCK_TYPES,
  type StaticBlockType,
  safeParseBlock,
  safeParseBlocks,
  toJsonPath,
} from '../src/index.ts';

/** A real 1×1 PNG and a tiny MP4 header, base64. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29t';

/** One valid, realistic fixture per block type. */
const FIXTURES: Record<StaticBlockType, Block> = {
  heading: {
    type: 'heading',
    id: 'intro',
    text: 'Quarterly review',
    level: 1,
    eyebrow: 'Q3 2026',
    subtitle: 'Northwind Labs, fictional data',
    align: 'center',
  },
  text: {
    type: 'text',
    markdown: 'Revenue grew **18%**.\n\n- New logos\n- Expansion',
    size: 'lg',
    step: 1,
    reveal: 'fade-up',
  },
  list: {
    type: 'list',
    style: 'check',
    items: [{ text: 'Ship the deck engine', done: true }, { text: 'Measure budgets' }],
  },
  quote: {
    type: 'quote',
    quote: 'One idea per slide.',
    cite: 'Ada Rivera',
    role: 'Designer',
    avatar: 'av-007',
  },
  callout: {
    type: 'callout',
    title: 'Heads up',
    body: 'All numbers are **fictional**.',
    icon: 'info',
    tone: 'warning',
  },
  divider: { type: 'divider', label: 'Part two', variant: 'line' },
  image: {
    type: 'image',
    src: PNG,
    alt: 'A single pixel used as a placeholder',
    width: 640,
    height: 360,
    caption: 'Figure 1',
    fit: 'cover',
  },
  video: {
    type: 'video',
    src: MP4,
    label: 'Product walkthrough',
    width: 1280,
    height: 720,
    autoplay: true,
    muted: true,
    loop: true,
    poster: 'avatar:av-012',
  },
  people: {
    type: 'people',
    title: 'Team',
    layout: 'grid',
    people: [
      { name: 'Ada Rivera', role: 'Design', avatar: 'av-001' },
      { name: 'Marco Diaz', role: 'Engineering', bio: 'Builds the engine.' },
    ],
  },
  stat: {
    type: 'stat',
    items: [
      { value: '87%', label: 'Teams kept the habit', delta: '+12 pts', deltaTone: 'success' },
      { value: '$1.2M', label: 'ARR', trend: [10, 12, 15, 14, 19] },
    ],
    source: 'Fictional cohort, n = 412',
  },
  table: {
    type: 'table',
    caption: 'Plans',
    currency: 'USD',
    columns: [
      { label: 'Plan' },
      { label: 'Price', format: 'cents', align: 'end' },
      { label: 'Share', format: 'percent' },
    ],
    rows: [
      ['Starter', 900, 0.4],
      ['Team', 2900, null],
    ],
    highlightRow: 1,
  },
  chart: {
    type: 'chart',
    spec: {
      kind: 'bar',
      title: 'Signups by month',
      labels: ['Jan', 'Feb', 'Mar'],
      series: [{ label: 'Signups', values: [120, 180, 240] }],
    },
    height: 'md',
  },
  code: {
    type: 'code',
    lang: 'ts',
    filename: 'hello.ts',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is TypeScript source text.
    code: "const greet = (name: string) => `Hello, ${name}`;\n\tconsole.log(greet('deck'));\nexport {};",
    highlights: ['1', '2-3'],
    lineNumbers: true,
  },
  timeline: {
    type: 'timeline',
    orientation: 'horizontal',
    events: [
      { time: '2024', title: 'Prototype' },
      { time: '2026', title: 'Launch', tone: 'accent', icon: 'rocket' },
    ],
  },
  steps: {
    type: 'steps',
    items: [
      { title: 'Brief', body: 'Describe the topic.' },
      { title: 'Generate' },
      { title: 'Present', icon: 'presentation' },
    ],
  },
  comparison: {
    type: 'comparison',
    columns: [{ label: 'Option A', highlight: true }, { label: 'Option B' }],
    rows: [
      { label: 'Setup time', values: ['5 min', '1 day'] },
      { label: 'Self-host', values: [true, false] },
    ],
  },
  cards: {
    type: 'cards',
    columns: 3,
    items: [
      { title: 'Fast', icon: 'zap', body: 'Minutes from JSON.' },
      {
        title: 'Safe',
        href: 'https://example.com/docs',
        image: 'avatar:av-020',
        imageAlt: 'A face',
      },
      { title: 'Local', href: '#local', tone: 'success' },
    ],
  },
  icon: { type: 'icon', icon: 'rocket', label: 'Launch', size: 'xl' },
  cta: {
    type: 'cta',
    title: 'Try it',
    actions: [
      { label: 'Read the docs', href: 'https://example.com/docs', variant: 'primary' },
      { label: 'Email us', href: 'mailto:team@example.com', variant: 'link' },
    ],
    footnote: 'Fictional company.',
  },
  columns: {
    type: 'columns',
    widths: 'wide-start',
    columns: [
      [{ type: 'text', markdown: 'Left' }],
      [{ type: 'icon', icon: 'check', decorative: true }],
    ],
  },
};

function issuesOf(input: unknown) {
  const result = safeParseBlock(input);
  expect(result.success, JSON.stringify(input).slice(0, 120)).toBe(false);
  return result.issues;
}

describe('block schema: valid fixtures', () => {
  it('covers every static content type, each mapped to a render family', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...STATIC_BLOCK_TYPES].sort());
    for (const type of BLOCK_TYPES) expect(BLOCK_FAMILIES).toContain(BLOCK_TYPE_FAMILY[type]);
  });

  it.each(STATIC_BLOCK_TYPES)('parses a valid %s block unchanged', (type) => {
    const result = safeParseBlock(FIXTURES[type]);
    expect(result.issues).toEqual([]);
    expect(result.data).toEqual(FIXTURES[type]);
  });

  it('parses a list of every fixture with unique ids', () => {
    const result = safeParseBlocks(Object.values(FIXTURES));
    expect(result.issues).toEqual([]);
    expect(result.data).toHaveLength(STATIC_BLOCK_TYPES.length);
  });

  it('accepts minimal blocks with only required fields', () => {
    for (const block of [
      { type: 'heading', text: 'Hi' },
      { type: 'text', markdown: 'x' },
      { type: 'divider' },
      { type: 'image', src: 'assets/cover.webp', alt: 'Cover', width: 1, height: 1 },
      { type: 'image', src: 'avatar:av-175', decorative: true, width: 64, height: 64 },
      { type: 'video', src: './clips/demo.mp4', label: 'Demo', width: 16, height: 9 },
      { type: 'code', code: 'x', lang: 'text' },
    ]) {
      expect(safeParseBlock(block).issues, block.type).toEqual([]);
    }
  });

  it('infers the columns type from the recursive schema', () => {
    expectTypeOf<ReturnType<typeof ColumnsBlockSchema.parse>>().toMatchTypeOf<ColumnsBlock>();
  });

  it('nests columns up to the depth limit', () => {
    const nest = (depth: number): Block =>
      depth === 0
        ? { type: 'text', markdown: 'leaf' }
        : { type: 'columns', columns: [[nest(depth - 1)], [{ type: 'divider' }]] };
    const deepest = nest(BLOCK_CONTENT_LIMITS.containerDepth);
    expect(containerDepth(deepest)).toBe(3);
    expect(safeParseBlock(deepest).issues).toEqual([]);
  });

  it('visits nested blocks depth-first with their paths', () => {
    const seen: string[] = [];
    forEachBlock([FIXTURES.heading, FIXTURES.columns], (block, path) => {
      seen.push(`${block.type}@${toJsonPath(path)}`);
    });
    expect(seen).toEqual([
      'heading@$[0]',
      'columns@$[1]',
      'text@$[1]["columns"][0][0]',
      'icon@$[1]["columns"][1][0]',
    ]);
  });

  it('classifies media sources and decodes base64 sizes', () => {
    expect(classifyMediaSource('avatar:av-001', 'image')).toEqual({
      ok: true,
      kind: 'avatar',
      bytes: 0,
    });
    expect(classifyMediaSource(PNG, 'image')).toMatchObject({ ok: true, kind: 'data' });
    expect(classifyMediaSource('img/a_b-1.JPG', 'image')).toMatchObject({ kind: 'relative' });
    expect(base64DecodedBytes('AAAA')).toBe(3);
    expect(base64DecodedBytes('AA==')).toBe(1);
  });

  it('parses highlight line specs', () => {
    expect(parseLineSpec('1-2,4')).toEqual([
      [1, 2],
      [4, 4],
    ]);
    expect(parseLineSpec('3-1')).toBeNull();
    expect(parseLineSpec('0')).toBeNull();
    expect(parseLineSpec('1;2')).toBeNull();
  });
});

describe('block schema rejects hostile input', () => {
  it('rejects unknown block types and a missing type', () => {
    expect(issuesOf({ type: 'script', code: 'alert(1)' })[0]?.jsonPath).toBe('$["type"]');
    expect(issuesOf({ text: 'no type' })[0]?.jsonPath).toBe('$["type"]');
    expect(issuesOf(null)[0]?.jsonPath).toBe('$');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    '//evil.example.com',
    '/\\evil.example.com',
    'file:///etc/passwd',
  ])('rejects the CTA href %j with a jsonPath', (href) => {
    const issues = issuesOf({ type: 'cta', actions: [{ label: 'Go', href }] });
    expect(issues.map((i) => i.jsonPath)).toContain('$["actions"][0]["href"]');
  });

  it('rejects unsafe card links the same way', () => {
    const issues = issuesOf({ type: 'cards', items: [{ title: 'x', href: 'javascript:void 0' }] });
    expect(issues[0]?.jsonPath).toBe('$["items"][0]["href"]');
  });

  it.each(['style', 'class', 'className', 'html', 'onclick', 'css', '__proto__'])(
    'rejects the unknown key %j',
    (key) => {
      const block = JSON.parse(`{"type":"text","markdown":"x","${key}":"color:red"}`);
      const issues = issuesOf(block);
      expect(issues[0]?.message).toMatch(/unrecognized key/i);
      expect(issues[0]?.jsonPath).toBe('$');
    }
  );

  it('rejects style keys on nested items too', () => {
    const issues = issuesOf({
      type: 'stat',
      items: [{ value: '1', label: 'x', style: 'color: red' }],
    });
    expect(issues[0]?.jsonPath).toBe('$["items"][0]');
  });

  it.each(['#ff0000', 'red', 'var(--accent)', 'rgb(0 0 0)', 'Accent', 'primary'])(
    'rejects the CSS-like tone %j',
    (tone) => {
      expect(issuesOf({ type: 'divider', tone })[0]?.jsonPath).toBe('$["tone"]');
      const nested = issuesOf({
        type: 'stat',
        items: [{ value: '1', label: 'x', deltaTone: tone }],
      });
      expect(nested[0]?.jsonPath).toBe('$["items"][0]["deltaTone"]');
    }
  );

  it.each([
    ['list', 'items', { text: 'x' }, BLOCK_CONTENT_LIMITS.listItems],
    ['steps', 'items', { title: 'x' }, BLOCK_CONTENT_LIMITS.steps],
    ['timeline', 'events', { time: '1', title: 'x' }, BLOCK_CONTENT_LIMITS.timelineEvents],
    ['people', 'people', { name: 'x' }, BLOCK_CONTENT_LIMITS.people],
    ['cards', 'items', { title: 'x' }, BLOCK_CONTENT_LIMITS.cards],
    ['stat', 'items', { value: '1', label: 'x' }, BLOCK_CONTENT_LIMITS.statItems],
  ] as const)('rejects a %s with too many %s', (type, key, item, max) => {
    const issues = issuesOf({ type, [key]: Array.from({ length: max + 1 }, () => item) });
    expect(issues[0]?.jsonPath).toBe(`$[${JSON.stringify(key)}]`);
    expect(issues[0]?.message).toMatch(/<=|at most|too big/i);
  });

  it('rejects oversize tables, comparisons and columns', () => {
    const row = Array.from({ length: 9 }, () => 'x');
    const wide = issuesOf({
      type: 'table',
      caption: 'Wide',
      columns: row.map((label) => ({ label })),
      rows: [row],
    });
    expect(wide[0]?.jsonPath).toBe('$["columns"]');
    const tall = issuesOf({
      type: 'table',
      caption: 'Tall',
      columns: [{ label: 'A' }],
      rows: Array.from({ length: 51 }, () => ['x']),
    });
    expect(tall[0]?.jsonPath).toBe('$["rows"]');
    const comparison = issuesOf({
      type: 'comparison',
      columns: Array.from({ length: 5 }, (_, i) => ({ label: `O${i}` })),
      rows: [{ label: 'x', values: [] }],
    });
    expect(comparison.map((i) => i.jsonPath)).toContain('$["columns"]');
    const columns = issuesOf({
      type: 'columns',
      columns: Array.from({ length: 5 }, () => [{ type: 'divider' }]),
    });
    expect(columns[0]?.jsonPath).toBe('$["columns"]');
  });

  it('rejects rows and values that do not match their columns', () => {
    expect(
      issuesOf({ type: 'table', caption: 'T', columns: [{ label: 'A' }], rows: [['a', 'b']] })[0]
        ?.jsonPath
    ).toBe('$["rows"][0]');
    expect(
      issuesOf({
        type: 'table',
        caption: 'T',
        columns: [{ label: 'Price', format: 'cents' }],
        rows: [[9.99]],
      })[0]?.message
    ).toBe('Money is integer cents');
    expect(
      issuesOf({
        type: 'comparison',
        columns: [{ label: 'A' }, { label: 'B' }],
        rows: [{ label: 'x', values: [true] }],
      })[0]?.jsonPath
    ).toBe('$["rows"][0]["values"]');
  });

  it('rejects tabs outside code and accepts CRLF line breaks in markdown', () => {
    expect(issuesOf({ type: 'text', markdown: 'a\tb' })[0]?.jsonPath).toBe('$["markdown"]');
    expect(safeParseBlock({ type: 'text', markdown: 'a\r\nb' }).issues).toEqual([]);
    expect(safeParseBlock({ type: 'code', code: '\tindented', lang: 'text' }).issues).toEqual([]);
    expect(issuesOf({ type: 'code', code: 'nul\u0000', lang: 'text' })[0]?.jsonPath).toBe(
      '$["code"]'
    );
  });

  it('rejects text over its limit and control or bidi characters', () => {
    const long = issuesOf({
      type: 'text',
      markdown: 'x'.repeat(BLOCK_CONTENT_LIMITS.markdown + 1),
    });
    expect(long[0]?.jsonPath).toBe('$["markdown"]');
    expect(issuesOf({ type: 'heading', text: 'a\nb' })[0]?.jsonPath).toBe('$["text"]');
    expect(issuesOf({ type: 'heading', text: 'admin\u202eexe.txt' })[0]?.jsonPath).toBe(
      '$["text"]'
    );
    expect(issuesOf({ type: 'text', markdown: 'bell\u0007' })[0]?.jsonPath).toBe('$["markdown"]');
    expect(issuesOf({ type: 'heading', text: '   ' })[0]?.jsonPath).toBe('$["text"]');
  });

  it.each([
    ['https://example.com/a.png', 'remote'],
    ['http://example.com/a.png', 'remote'],
    ['//example.com/a.png', 'protocol-relative'],
    ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'SVG'],
    ['data:text/html;base64,PHNjcmlwdD4=', 'HTML'],
    ['data:image/png,notbase64', 'not base64'],
    ['data:image/png;base64,abc', 'malformed base64'],
    ['../secret.png', 'traversal'],
    ['assets/../../etc/passwd.png', 'traversal'],
    ['/assets/a.png', 'root-absolute'],
    ['assets/a.svg', 'svg path'],
    ['assets\\a.png', 'backslash'],
    ['avatar:av-999', 'unknown avatar'],
    ['avatar:../../x', 'bad avatar'],
    ['javascript:alert(1)//.png', 'script scheme'],
  ])('rejects the image source %j (%s)', (src) => {
    const issues = issuesOf({ type: 'image', src, alt: 'x', width: 1, height: 1 });
    expect(issues.map((i) => i.jsonPath)).toContain('$["src"]');
  });

  it('rejects embedded media over 192 KB', () => {
    const payload = 'A'.repeat((Math.ceil(MEDIA_DATA_URI_MAX_BYTES / 3) + 4) * 4);
    const src = `data:image/png;base64,${payload}`;
    expect(classifyMediaSource(src, 'image').ok).toBe(false);
    expect(issuesOf({ type: 'image', src, alt: 'x', width: 1, height: 1 })[0]?.message).toMatch(
      /192 KB/
    );
  });

  it('rejects images without alt, decorative images with alt, and unmuted autoplay', () => {
    expect(issuesOf({ type: 'image', src: PNG, width: 1, height: 1 })[0]?.jsonPath).toBe(
      '$["alt"]'
    );
    expect(
      issuesOf({ type: 'image', src: PNG, alt: 'x', decorative: true, width: 1, height: 1 })[0]
        ?.jsonPath
    ).toBe('$["alt"]');
    expect(
      issuesOf({ type: 'video', src: MP4, label: 'x', width: 1, height: 1, autoplay: true })[0]
        ?.jsonPath
    ).toBe('$["muted"]');
    expect(
      issuesOf({ type: 'video', src: PNG, label: 'x', width: 1, height: 1 })[0]?.jsonPath
    ).toBe('$["src"]');
    expect(
      issuesOf({ type: 'image', src: PNG, alt: 'x', width: 0, height: 99_999 }).map(
        (i) => i.jsonPath
      )
    ).toEqual(['$["width"]', '$["height"]']);
  });

  it('rejects a chart spec that ChartSpecSchema rejects', () => {
    const issues = issuesOf({
      type: 'chart',
      spec: { kind: 'pie', title: 'x', labels: ['a'], series: [{ label: 's', values: [-1] }] },
    });
    expect(issues[0]?.jsonPath).toBe('$["spec"]["series"][0]["values"]');
  });

  it('rejects bad code languages, too many lines and out-of-range highlights', () => {
    expect(issuesOf({ type: 'code', code: 'x', lang: 'php' })[0]?.jsonPath).toBe('$["lang"]');
    expect(
      issuesOf({
        type: 'code',
        code: 'a\n'.repeat(BLOCK_CONTENT_LIMITS.codeLines + 1),
        lang: 'text',
      })[0]?.jsonPath
    ).toBe('$["code"]');
    expect(
      issuesOf({ type: 'code', code: 'a\nb', lang: 'text', highlights: ['1', '3'] })[0]?.jsonPath
    ).toBe('$["highlights"][1]');
    expect(
      issuesOf({ type: 'code', code: 'a', lang: 'text', highlights: ['1;alert(1)'] })[0]?.jsonPath
    ).toBe('$["highlights"][0]');
  });

  it('rejects bad ids, steps, reveals, icons and avatars', () => {
    expect(issuesOf({ type: 'divider', id: 'Has Spaces' })[0]?.jsonPath).toBe('$["id"]');
    expect(issuesOf({ type: 'divider', step: 33 })[0]?.jsonPath).toBe('$["step"]');
    expect(issuesOf({ type: 'divider', step: 1.5 })[0]?.jsonPath).toBe('$["step"]');
    expect(issuesOf({ type: 'divider', reveal: 'explode' })[0]?.jsonPath).toBe('$["reveal"]');
    expect(issuesOf({ type: 'icon', icon: '<svg onload=x>', label: 'x' })[0]?.jsonPath).toBe(
      '$["icon"]'
    );
    expect(issuesOf({ type: 'icon', icon: 'rocket' })[0]?.jsonPath).toBe('$["label"]');
    expect(issuesOf({ type: 'quote', quote: 'x', avatar: 'av-000' })[0]?.jsonPath).toBe(
      '$["avatar"]'
    );
  });

  it('rejects list and card cross-field mistakes', () => {
    expect(issuesOf({ type: 'list', items: [{ text: 'x', done: true }] })[0]?.jsonPath).toBe(
      '$["items"][0]["done"]'
    );
    expect(issuesOf({ type: 'list', style: 'icon', items: [{ text: 'x' }] })[0]?.jsonPath).toBe(
      '$["items"][0]["icon"]'
    );
    expect(issuesOf({ type: 'cards', items: [{ title: 'x', imageAlt: 'y' }] })[0]?.jsonPath).toBe(
      '$["items"][0]["imageAlt"]'
    );
  });

  it('rejects columns nested deeper than the limit', () => {
    const nest = (depth: number): Block =>
      depth === 0
        ? { type: 'divider' }
        : { type: 'columns', columns: [[nest(depth - 1)], [{ type: 'divider' }]] };
    const issues = issuesOf(nest(BLOCK_CONTENT_LIMITS.containerDepth + 1));
    expect(issues.map((i) => i.jsonPath)).toContain('$["columns"]');
    expect(issues.map((i) => i.message).join(' ')).toMatch(/nest at most 3/);
  });

  it('rejects an invalid block inside a column with its full path', () => {
    const issues = issuesOf({
      type: 'columns',
      columns: [[{ type: 'divider' }], [{ type: 'text', markdown: 'x', style: 'x' }]],
    });
    expect(issues[0]?.jsonPath).toBe('$["columns"][1][0]');
  });

  it('rejects duplicate ids anywhere in a block list', () => {
    const result = safeParseBlocks([
      { type: 'heading', id: 'same', text: 'A' },
      { type: 'columns', columns: [[{ type: 'divider', id: 'same' }], [{ type: 'divider' }]] },
    ]);
    expect(result.success).toBe(false);
    expect(result.issues[0]?.jsonPath).toBe('$[1]["columns"][0][0]["id"]');
    expect(result.issues[0]?.message).toContain('first used at $[0]');
  });
});
