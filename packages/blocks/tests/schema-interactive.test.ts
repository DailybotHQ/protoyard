// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BLOCK_CONTENT_LIMITS,
  BLOCK_TYPES,
  type Block,
  BlockListSchema,
  type BlockType,
  containerDepth,
  embeddedAppProblem,
  forEachBlock,
  STATEFUL_BLOCK_TYPES,
  STATIC_BLOCK_TYPES,
  safeParseBlock,
  safeParseBlocks,
  toJsonPath,
} from '../src/index.ts';

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

const FIXTURES: Record<InteractiveType, Block> = {
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

function issuesOf(input: unknown) {
  const result = safeParseBlock(input);
  expect(result.success, JSON.stringify(input).slice(0, 160)).toBe(false);
  return result.issues;
}

const paths = (input: unknown) => issuesOf(input).map((issue) => issue.jsonPath);

/** Clones a fixture and applies a change. */
function variant<T extends InteractiveType>(
  type: T,
  change: (block: Record<string, unknown>) => void
) {
  const block = structuredClone(FIXTURES[type]) as unknown as Record<string, unknown>;
  change(block);
  return block;
}

describe('interactive block schemas: valid fixtures', () => {
  it('covers every block type together with the content fixtures', () => {
    expect([...STATIC_BLOCK_TYPES, ...STATEFUL_BLOCK_TYPES].sort()).toEqual(
      [...BLOCK_TYPES].sort()
    );
    expect(Object.keys(FIXTURES).sort()).toEqual([...STATEFUL_BLOCK_TYPES].sort());
  });

  it.each(STATEFUL_BLOCK_TYPES)('parses a valid %s block unchanged', (type) => {
    const result = safeParseBlock(FIXTURES[type]);
    expect(result.issues).toEqual([]);
    expect(result.data).toEqual(FIXTURES[type]);
  });

  it('parses every interactive fixture in one list with unique ids', () => {
    expect(safeParseBlocks(Object.values(FIXTURES)).issues).toEqual([]);
  });

  it('accepts containers nested exactly three deep, in any mix', () => {
    const deepest: Block = {
      type: 'columns',
      columns: [
        [
          {
            type: 'tabs',
            id: 'outer-tabs',
            label: 'Outer',
            panels: [
              {
                id: 'a',
                label: 'A',
                blocks: [{ type: 'reveal', id: 'inner', label: 'More', blocks: [FIXTURES.poll] }],
              },
              { id: 'b', label: 'B', blocks: [{ type: 'divider' }] },
            ],
          },
        ],
        [{ type: 'divider' }],
      ],
    };
    expect(containerDepth(deepest)).toBe(3);
    expect(safeParseBlock(deepest).issues).toEqual([]);
  });

  it('allows an embedded app inside containers', () => {
    const block = {
      type: 'reveal',
      id: 'demo',
      label: 'Open the demo',
      blocks: [FIXTURES['embed-app']],
    };
    expect(safeParseBlock(block).issues).toEqual([]);
  });

  it('walks tab panels and reveals with their paths', () => {
    const seen: string[] = [];
    forEachBlock([FIXTURES.tabs, FIXTURES.reveal], (block, path) => {
      seen.push(`${block.type}@${toJsonPath(path)}`);
    });
    expect(seen).toEqual([
      'tabs@$[0]',
      'text@$[0]["panels"][0]["blocks"][0]',
      'divider@$[0]["panels"][1]["blocks"][0]',
      'reveal@$[1]',
      'text@$[1]["blocks"][0]',
    ]);
  });

  it('still emits a JSON Schema with $defs for the recursive union', () => {
    const schema = z.toJSONSchema(BlockListSchema) as { $defs?: Record<string, unknown> };
    expect(Object.keys(schema.$defs ?? {}).length).toBeGreaterThan(0);
    expect(JSON.stringify(schema)).toContain('"$ref"');
  });
});

describe('interactive block schemas rejects', () => {
  it.each(STATEFUL_BLOCK_TYPES)('rejects a %s block without an id', (type) => {
    const block = variant(type, (b) => {
      delete b.id;
    });
    expect(paths(block)).toContain('$["id"]');
  });

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

  it('rejects an embed-app block placed inside an embedded app directly', () => {
    const block = variant('embed-app', (b) => {
      b.app = { ...APP, extra: FIXTURES['embed-app'] };
    });
    expect(paths(block)).toContain('$["app"]["extra"]');
  });

  it.each([
    ['a deck', { ...APP, kind: 'deck' }, '$["app"]["kind"]'],
    ['a page', { ...APP, kind: 'page' }, '$["app"]["kind"]'],
    ['an array', [APP], '$["app"]'],
    ['a string', 'https://example.com', '$["app"]'],
  ])('rejects %s as the embedded app', (_name, app, jsonPath) => {
    expect(paths(variant('embed-app', (b) => (b.app = app)))).toContain(jsonPath);
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

  it('rejects poll mistakes', () => {
    expect(
      paths(
        variant(
          'poll',
          (b) => ((b.options as { id: string }[])[1] = { id: 'decks', label: 'Again' } as never)
        )
      )
    ).toContain('$["options"][1]["id"]');
    expect(paths(variant('poll', (b) => (b.maxChoices = 4)))).toContain('$["maxChoices"]');
    expect(
      paths(
        variant('poll', (b) => {
          b.options = Array.from({ length: BLOCK_CONTENT_LIMITS.pollOptions + 1 }, (_, i) => ({
            id: `o${i}`,
            label: `O${i}`,
          }));
        })
      )
    ).toContain('$["options"]');
    expect(paths(variant('poll', (b) => (b.results = 'live')))).toContain('$["results"]');
  });

  it('rejects quiz mistakes', () => {
    const question = (b: Record<string, unknown>) =>
      (b.questions as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(paths(variant('quiz', (b) => (question(b).answers = ['missing'])))).toContain(
      '$["questions"][0]["answers"][0]'
    );
    expect(paths(variant('quiz', (b) => (question(b).answers = ['css', 'css'])))).toContain(
      '$["questions"][0]["answers"][1]'
    );
    expect(
      paths(
        variant('quiz', (b) => {
          question(b).choices = Array.from({ length: 7 }, (_, i) => ({
            id: `c${i}`,
            label: `C${i}`,
          }));
          question(b).answers = ['c0'];
        })
      )
    ).toContain('$["questions"][0]["choices"]');
    expect(
      paths(
        variant('quiz', (b) => {
          const one = question(b);
          b.questions = Array.from({ length: BLOCK_CONTENT_LIMITS.quizQuestions + 1 }, (_, i) => ({
            ...one,
            id: `q${i}`,
          }));
        })
      )
    ).toContain('$["questions"]');
    expect(paths(variant('quiz', (b) => (b.passScore = 1.5)))).toContain('$["passScore"]');
    expect(
      paths(variant('quiz', (b) => ((b.questions as unknown[])[1] = { ...question(b) })))
    ).toContain('$["questions"][1]["id"]');
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

  it('rejects calculator formulas with type mismatches or over the formula caps', () => {
    const withFormula = (formula: unknown) =>
      variant('calculator', (b) => {
        ((b.outputs as Record<string, unknown>[])[0] as Record<string, unknown>).formula = formula;
      });
    expect(
      paths(withFormula({ op: 'add', left: { op: 'lt', left: n(1), right: n(2) }, right: n(1) }))
    ).toContain('$["outputs"][0]["formula"]["left"]["op"]');
    let deep: Record<string, unknown> = n(1);
    for (let i = 0; i < 13; i += 1) deep = { op: 'round', value: deep };
    expect(
      issuesOf(withFormula(deep))
        .map((i) => i.message)
        .join(' ')
    ).toMatch(/nests at most 12/);
    const wide = {
      op: 'max',
      args: Array.from({ length: 8 }, () => ({
        op: 'min',
        args: Array.from({ length: 8 }, () => n(1)),
      })),
    };
    expect(
      issuesOf(withFormula(wide))
        .map((i) => i.message)
        .join(' ')
    ).toMatch(/at most 64 nodes/);
    expect(paths(withFormula({ op: 'eval', code: 'alert(1)' }))).toContain(
      '$["outputs"][0]["formula"]["op"]'
    );
  });

  it('rejects calculator input and chart mistakes', () => {
    const input = (b: Record<string, unknown>) =>
      (b.inputs as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(paths(variant('calculator', (b) => (input(b).max = 1)))).toContain(
      '$["inputs"][0]["max"]'
    );
    expect(paths(variant('calculator', (b) => (input(b).default = 500)))).toContain(
      '$["inputs"][0]["default"]'
    );
    expect(paths(variant('calculator', (b) => (input(b).step = 0.001)))).toContain(
      '$["inputs"][0]["step"]'
    );
    expect(paths(variant('calculator', (b) => (input(b).name = 'Seats!')))).toContain(
      '$["inputs"][0]["name"]'
    );
    expect(
      paths(variant('calculator', (b) => ((b.inputs as unknown[])[1] = { ...input(b) })))
    ).toContain('$["inputs"][1]["name"]');
    expect(
      paths(variant('calculator', (b) => (b.chart = { output: 'nope', input: 'seats' })))
    ).toContain('$["chart"]["output"]');
    expect(
      paths(variant('calculator', (b) => (b.chart = { output: 'monthly', input: 'nope' })))
    ).toContain('$["chart"]["input"]');
    expect(
      paths(
        variant('calculator', (b) => {
          b.inputs = Array.from({ length: BLOCK_CONTENT_LIMITS.calculatorInputs + 1 }, (_, i) => ({
            ...input(b),
            name: `in${i}`,
          }));
        })
      )
    ).toContain('$["inputs"]');
  });

  it('rejects counter bounds that contradict each other', () => {
    expect(paths(variant('counter', (b) => (b.start = 101)))).toContain('$["start"]');
    expect(
      paths(
        variant('counter', (b) => {
          b.min = 5;
          b.max = 5;
        })
      )
    ).toContain('$["max"]');
    expect(paths(variant('counter', (b) => (b.step = 0)))).toContain('$["step"]');
  });

  it('rejects chart controls that cannot work for the spec', () => {
    expect(
      paths(
        variant('chart-controls', (b) => {
          delete b.kinds;
          delete b.seriesToggle;
          delete b.range;
        })
      )
    ).toContain('$');
    expect(paths(variant('chart-controls', (b) => (b.kinds = ['bar', 'area'])))).toContain(
      '$["kinds"]'
    );
    expect(paths(variant('chart-controls', (b) => (b.kinds = ['line', 'pie'])))).toContain(
      '$["kinds"][1]'
    );
    expect(
      paths(
        variant('chart-controls', (b) => {
          const spec = b.spec as { series: unknown[] };
          spec.series = spec.series.slice(0, 1);
        })
      )
    ).toContain('$["seriesToggle"]');
    expect(
      paths(
        variant('chart-controls', (b) => {
          b.spec = {
            kind: 'line',
            title: 'x',
            labels: ['a', 'b'],
            series: [{ label: 's', values: [1, 2] }],
          };
          b.seriesToggle = false;
        })
      )
    ).toContain('$["range"]');
  });

  it('rejects map points off the map, unknown route stops and too many points', () => {
    const point = (b: Record<string, unknown>) =>
      (b.points as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(paths(variant('map', (b) => (point(b).lat = 89)))).toContain('$["points"][0]["lat"]');
    expect(paths(variant('map', (b) => (point(b).lng = Number.NaN)))).toContain(
      '$["points"][0]["lng"]'
    );
    expect(paths(variant('map', (b) => (b.route = ['north', 'mars'])))).toContain('$["route"][1]');
    expect(paths(variant('map', (b) => (b.basemap = 'earth')))).toContain('$["basemap"]');
    expect(
      paths(
        variant('map', (b) => {
          b.points = Array.from({ length: BLOCK_CONTENT_LIMITS.mapPoints + 1 }, (_, i) => ({
            ...point(b),
            id: `p${i}`,
          }));
          delete b.route;
        })
      )
    ).toContain('$["points"]');
  });

  it('rejects form field mistakes with their paths', () => {
    const field = (b: Record<string, unknown>, i: number) =>
      (b.fields as Record<string, unknown>[])[i] as Record<string, unknown>;
    expect(paths(variant('form', (b) => delete field(b, 7).options))).toContain(
      '$["fields"][7]["options"]'
    );
    expect(
      paths(
        variant(
          'form',
          (b) =>
            (field(b, 1).options = [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ])
        )
      )
    ).toContain('$["fields"][1]["options"]');
    expect(paths(variant('form', (b) => (field(b, 1).min = 1)))).toContain('$["fields"][1]["min"]');
    expect(paths(variant('form', (b) => (field(b, 5).maxLength = 10)))).toContain(
      '$["fields"][5]["maxLength"]'
    );
    expect(paths(variant('form', (b) => (field(b, 1).maxTags = 3)))).toContain(
      '$["fields"][1]["maxTags"]'
    );
    expect(paths(variant('form', (b) => (field(b, 6).placeholder = 'Yes')))).toContain(
      '$["fields"][6]["placeholder"]'
    );
    expect(paths(variant('form', (b) => (field(b, 5).max = 0)))).toContain('$["fields"][5]["max"]');
    expect(paths(variant('form', (b) => (field(b, 1).name = 'email')))).toContain(
      '$["fields"][1]["name"]'
    );
    expect(paths(variant('form', (b) => (field(b, 1).name = '__proto__')))).toContain(
      '$["fields"][1]["name"]'
    );
    expect(paths(variant('form', (b) => (field(b, 1).type = 'password')))).toContain(
      '$["fields"][1]["type"]'
    );
    expect(paths(variant('form', (b) => (field(b, 1).maxLength = 5000)))).toContain(
      '$["fields"][1]["maxLength"]'
    );
    expect(
      paths(
        variant('form', (b) => {
          (field(b, 7).options as Record<string, unknown>[])[1] = {
            value: 'design',
            label: 'Again',
          };
        })
      )
    ).toContain('$["fields"][7]["options"][1]["value"]');
    expect(
      paths(
        variant('form', (b) => {
          b.fields = Array.from({ length: BLOCK_CONTENT_LIMITS.formFields + 1 }, (_, i) => ({
            name: `f${i}`,
            label: 'F',
            type: 'text',
          }));
        })
      )
    ).toContain('$["fields"]');
    expect(paths(variant('form', (b) => delete b.submitLabel))).toContain('$["submitLabel"]');
  });

  it('rejects tab and reveal mistakes', () => {
    expect(paths(variant('tabs', (b) => (b.defaultPanel = 'enterprise')))).toContain(
      '$["defaultPanel"]'
    );
    expect(
      paths(
        variant(
          'tabs',
          (b) =>
            (((b.panels as Record<string, unknown>[])[1] as Record<string, unknown>).id = 'solo')
        )
      )
    ).toContain('$["panels"][1]["id"]');
    expect(
      paths(variant('tabs', (b) => (b.panels = (b.panels as unknown[]).slice(0, 1))))
    ).toContain('$["panels"]');
    expect(paths(variant('reveal', (b) => (b.blocks = [])))).toContain('$["blocks"]');
  });

  it('rejects duplicate block ids across tab panels and reveals', () => {
    const result = safeParseBlocks([
      FIXTURES.poll,
      { ...FIXTURES.reveal, blocks: [{ ...FIXTURES.poll }] },
    ]);
    expect(result.issues[0]?.jsonPath).toBe('$[1]["blocks"][0]["id"]');
  });

  it('lists every stateful type as requiring an id', () => {
    const optionalId = BLOCK_TYPES.filter(
      (type) => !(STATEFUL_BLOCK_TYPES as readonly BlockType[]).includes(type)
    );
    for (const type of optionalId)
      expect(STATIC_BLOCK_TYPES as readonly BlockType[]).toContain(type);
  });
});
