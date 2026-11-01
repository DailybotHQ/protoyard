// @vitest-environment node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_CONTENT_LIMITS,
  BLOCK_FAMILIES,
  BLOCK_TYPE_FAMILY,
  BLOCK_TYPES,
  type Block,
  classifyMediaSource,
  embeddedAppProblem,
  MEDIA_DATA_URI_MAX_BYTES,
  STATEFUL_BLOCK_TYPES,
  STATIC_BLOCK_TYPES,
  type StaticBlockType,
  safeParseBlock,
  safeParseBlocks,
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
      { title: 'Local', href: 'https://example.com/local', tone: 'success' },
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
  flow: {
    type: 'flow',
    id: 'prototype-flow',
    step: 1,
    reveal: 'fade-up',
    nodes: [
      { id: 'plan', label: 'Plan' },
      { id: 'build', label: 'Build', tone: 'accent' },
    ],
    loopBack: true,
  },
  tree: {
    type: 'tree',
    style: 'file-tree',
    nodes: [
      { id: 'src', parentId: null, label: 'src' },
      { id: 'index', parentId: 'src', label: 'index.ts' },
    ],
  },
  board: {
    type: 'board',
    columns: [
      { id: 'doing', title: 'Doing', cards: [{ id: 'wire', title: 'Wire guard', tone: 'info' }] },
    ],
  },
  terminal: {
    type: 'terminal',
    lines: [
      { kind: 'prompt', text: '$ protoyard validate demo' },
      { kind: 'output', text: 'Valid' },
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
});

describe('block schema rejects hostile input', () => {
  it('rejects unknown block types and a missing type', () => {
    expect(issuesOf({ type: 'script', code: 'alert(1)' })[0]?.jsonPath).toBe('$["type"]');
    expect(issuesOf({ text: 'no type' })[0]?.jsonPath).toBe('$["type"]');
    expect(issuesOf(null)[0]?.jsonPath).toBe('$');
  });

  it('rejects every unsafe CTA href with a jsonPath', () => {
    for (const href of [
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
    ]) {
      const issues = issuesOf({ type: 'cta', actions: [{ label: 'Go', href }] });
      expect(issues.map((i) => i.jsonPath)).toContain('$["actions"][0]["href"]');
    }
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

  it('rejects every remote or unsafe image source', () => {
    for (const src of [
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
    ]) {
      const issues = issuesOf({ type: 'image', src, alt: 'x', width: 1, height: 1 });
      expect(issues.map((i) => i.jsonPath)).toContain('$["src"]');
    }
  });

  it('rejects embedded media over 192 KB', () => {
    const payload = 'A'.repeat((Math.ceil(MEDIA_DATA_URI_MAX_BYTES / 3) + 4) * 4);
    const src = `data:image/png;base64,${payload}`;
    expect(classifyMediaSource(src, 'image').ok).toBe(false);
    expect(issuesOf({ type: 'image', src, alt: 'x', width: 1, height: 1 })[0]?.message).toMatch(
      /192 KB/
    );
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

// --- merged from schema-interactive.test.ts ---

const n = (value: number) => ({ op: 'num' as const, value });
const v = (name: string) => ({ op: 'var' as const, name });

/** A small, valid app blueprint used as an opaque embed payload. */
const APP = {
  formatVersion: 1,
  name: 'Mini tracker',
  entities: [{ name: 'task', fields: [{ name: 'title', kind: 'text', required: true }] }],
  roles: [{ id: 'member', label: 'Member' }],
};

type InteractiveType = (typeof STATEFUL_BLOCK_TYPES)[number];

const INTERACTIVE_FIXTURES: Record<InteractiveType, Block> = {
  tabs: {
    type: 'tabs',
    id: 'plans',
    label: 'Plans',
    defaultPanel: 'team',
    panels: [
      { id: 'solo', label: 'Solo', blocks: [{ type: 'text', markdown: 'For one person.' }] },
      { id: 'team', label: 'Team', icon: 'users', blocks: [{ type: 'divider' }] },
    ],
  },
  reveal: {
    type: 'reveal',
    id: 'answer',
    label: 'Show the answer',
    openLabel: 'Hide the answer',
    blocks: [{ type: 'text', markdown: '**42**' }],
  },
  poll: {
    type: 'poll',
    id: 'favorite',
    question: 'Which feature do you use most?',
    options: [
      { id: 'decks', label: 'Decks' },
      { id: 'pages', label: 'Pages' },
      { id: 'apps', label: 'Apps' },
    ],
    maxChoices: 2,
    results: 'after-vote',
  },
  quiz: {
    type: 'quiz',
    id: 'check',
    title: 'Quick check',
    feedback: 'immediate',
    passScore: 0.5,
    shuffle: true,
    questions: [
      {
        id: 'q1',
        prompt: 'What does a **tone** replace?',
        choices: [
          { id: 'css', label: 'CSS colors' },
          { id: 'fonts', label: 'Fonts' },
        ],
        answers: ['css'],
        explanation: 'Blocks never accept CSS.',
      },
      {
        id: 'q2',
        prompt: 'Pick the containers.',
        choices: [
          { id: 'tabs', label: 'Tabs' },
          { id: 'poll', label: 'Poll' },
          { id: 'reveal', label: 'Reveal' },
        ],
        answers: ['tabs', 'reveal'],
      },
    ],
  },
  calculator: {
    type: 'calculator',
    id: 'pricing',
    title: 'What would it cost?',
    currency: 'USD',
    inputs: [
      { name: 'seats', label: 'Seats', control: 'slider', min: 1, max: 200, step: 1, default: 10 },
      {
        name: 'discount',
        label: 'Discount',
        min: 0,
        max: 0.5,
        step: 0.05,
        default: 0,
        unit: 'percent',
      },
    ],
    outputs: [
      {
        id: 'monthly',
        label: 'Per month',
        unit: 'cents',
        emphasis: true,
        formula: {
          op: 'round',
          value: {
            op: 'mul',
            left: { op: 'mul', left: v('seats'), right: n(1200) },
            right: { op: 'sub', left: n(1), right: v('discount') },
          },
        },
      },
      {
        id: 'tier',
        label: 'Volume tier',
        formula: {
          op: 'if',
          test: { op: 'gte', left: v('seats'), right: n(50) },
          ifTrue: n(2),
          ifFalse: n(1),
        },
      },
    ],
    chart: { output: 'monthly', input: 'seats', kind: 'line', points: 20 },
  },
  counter: { type: 'counter', id: 'claps', label: 'Claps', start: 0, step: 1, min: 0, max: 100 },
  'chart-controls': {
    type: 'chart-controls',
    id: 'growth',
    spec: {
      kind: 'line',
      title: 'Signups',
      labels: ['Jan', 'Feb', 'Mar', 'Apr'],
      series: [
        { label: 'Organic', values: [10, 14, 20, 26] },
        { label: 'Paid', values: [4, 6, 9, 12] },
      ],
    },
    kinds: ['line', 'bar', 'area'],
    seriesToggle: true,
    range: true,
  },
  map: {
    type: 'map',
    id: 'stores',
    label: 'Stores on the simulated map',
    basemap: 'port-meridian',
    points: [
      { id: 'north', label: 'North pier', lng: -18.6, lat: -30.8, tone: 'accent' },
      { id: 'market', label: 'Market', lng: -18.4, lat: -31.1, icon: 'shopping-cart' },
    ],
    route: ['north', 'market'],
  },
  'embed-app': {
    type: 'embed-app',
    id: 'try-it',
    title: 'Try the tracker',
    height: 'md',
    app: APP,
  },
  form: {
    type: 'form',
    id: 'signup',
    title: 'Join the beta',
    fields: [
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        placeholder: 'you@example.com',
      },
      { name: 'company', label: 'Company', type: 'text', maxLength: 120 },
      { name: 'about', label: 'About you', type: 'longText', help: 'Optional.' },
      { name: 'site', label: 'Website', type: 'url' },
      { name: 'phone', label: 'Phone', type: 'phone' },
      { name: 'seats', label: 'Seats', type: 'number', min: 1, max: 500 },
      { name: 'updates', label: 'Send me updates', type: 'boolean' },
      {
        name: 'role',
        label: 'Role',
        type: 'enum',
        required: true,
        options: [
          { value: 'design', label: 'Design' },
          { value: 'eng', label: 'Engineering' },
        ],
      },
      { name: 'topics', label: 'Topics', type: 'tags', maxTags: 5 },
    ],
    submitLabel: 'Request access',
    successMessage: 'Thanks! This is a simulated form; nothing was sent.',
  },
};

/** Clones a fixture and applies a change. */
function variant<T extends InteractiveType>(
  type: T,
  change: (block: Record<string, unknown>) => void
) {
  const block = structuredClone(INTERACTIVE_FIXTURES[type]) as unknown as Record<string, unknown>;
  change(block);
  return block;
}

describe('interactive block schemas rejects', () => {
  it('rejects containers nested deeper than three, whatever the mix', () => {
    const tooDeep = {
      type: 'reveal',
      id: 'r1',
      label: 'One',
      blocks: [
        {
          type: 'tabs',
          id: 't1',
          label: 'Two',
          panels: [
            {
              id: 'p1',
              label: 'P',
              blocks: [
                {
                  type: 'columns',
                  columns: [
                    [{ type: 'reveal', id: 'r2', label: 'Four', blocks: [{ type: 'divider' }] }],
                    [{ type: 'divider' }],
                  ],
                },
              ],
            },
            { id: 'p2', label: 'Q', blocks: [{ type: 'divider' }] },
          ],
        },
      ],
    };
    const issues = issuesOf(tooDeep);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/nest at most 3 deep/);
  });

  it('rejects an embedded app that embeds another app, at the nested path', () => {
    const nested = variant('embed-app', (b) => {
      b.app = {
        ...APP,
        screens: [{ kind: 'dashboard', widgets: [{ type: 'embed-app', id: 'x', app: APP }] }],
      };
    });
    const issues = issuesOf(nested);
    expect(issues[0]?.jsonPath).toBe('$["app"]["screens"][0]["widgets"][0]');
    expect(issues[0]?.message).toMatch(/cannot embed another app/);
  });

  it('rejects embedded apps over the byte or depth limit', () => {
    const big = { ...APP, description: 'x'.repeat(BLOCK_CONTENT_LIMITS.embedBytes) };
    expect(issuesOf(variant('embed-app', (b) => (b.app = big)))[0]?.message).toMatch(/KB of JSON/);
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < BLOCK_CONTENT_LIMITS.embedDepth + 2; i += 1) deep = { child: deep };
    expect(issuesOf(variant('embed-app', (b) => (b.app = deep)))[0]?.message).toMatch(
      /nests at most/
    );
    const cyclic: Record<string, unknown> = { ...APP };
    cyclic.self = cyclic;
    expect(embeddedAppProblem(cyclic)?.message).toMatch(/no cycles/);
    expect(embeddedAppProblem(APP)).toBeNull();
  });

  it('rejects calculator formulas that read unknown inputs, with the formula path', () => {
    const block = variant('calculator', (b) => {
      const output = (b.outputs as Record<string, unknown>[])[0] as Record<string, unknown>;
      output.formula = { op: 'mul', left: v('seats'), right: v('price') };
    });
    const issue = issuesOf(block)[0];
    expect(issue?.jsonPath).toBe('$["outputs"][0]["formula"]["right"]["name"]');
    expect(issue?.message).toMatch(/Unknown variable "price".*discount, seats/);
  });
});

// --- merged from package-shape.test.ts ---

/**
 * `@protoyard/blocks` is the framework-free half of the blocks kit (ADR-022,
 * ADR-037): schemas and engines run in Node tests, in the blueprint union, in
 * the CLI and in kind runtimes, so the package never imports Svelte or a UI
 * package. Heavier engines live behind their own subpaths.
 */
const PKG = join(import.meta.dirname, '..');
const SRC = join(PKG, 'src');
const SUBPATHS = ['formula', 'interactive', 'code', 'diagram', 'catalog'] as const;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|js|svelte)$/.test(name)) out.push(path);
  }
  return out;
}

export function frameworkImports(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
    const spec = match[1] ?? '';
    if (
      /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|blocks-ui|views-ui|charts-ui|ai-ui|renderer-svelte|devtools|crud|player|database|blueprint)(\/|$)|^dexie$/.test(
        spec
      )
    ) {
      found.push(spec);
    }
  }
  return found;
}

describe('@protoyard/blocks package shape', () => {
  it('never imports Svelte, a UI package, the database or the blueprint', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(SUBPATHS.length + 1);
    const offenders = files.flatMap((file) =>
      frameworkImports(readFileSync(file, 'utf8')).map((spec) => `${relative(PKG, file)} → ${spec}`)
    );
    expect(offenders).toEqual([]);
  });
});

describe('@protoyard/blocks/safety', () => {
  it('stays free of zod, markdown, chart and catalog imports so first screens can use it', () => {
    const source = readFileSync(join(PKG, 'src/safety.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports).toEqual(['@texuli/blocks/core']);
  });
});
