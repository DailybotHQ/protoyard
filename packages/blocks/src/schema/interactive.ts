import { ChartSpecSchema } from '@protoyard/ai/chart';
import { z } from 'zod';
import { FormulaVariableNameSchema, NumberFormulaSchema, parseFormula } from '../formula/index.ts';
import {
  BlockIdSchema,
  BlockToneSchema,
  blockBase,
  IconNameSchema,
  BLOCK_CONTENT_LIMITS as L,
  markdownText,
  plainText,
} from './primitives.ts';

/**
 * Interactive blocks (ADR-037). Each one keeps state through the kind
 * runtime's `BlockStateHost`, keyed by `<documentId>/<blockId>`, so every
 * interactive block requires a stable `id`. Nothing here is executed:
 * calculator formulas are the closed AST of `@protoyard/blocks/formula`, and
 * an embedded app is opaque, bounded JSON that the host validates and mounts.
 */

/** Interactive blocks share the base fields but always carry an id. */
const interactiveBase = { ...blockBase, id: BlockIdSchema };

function uniqueIds(
  items: readonly { id: string }[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
  what: string
): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, i, 'id'],
        message: `${what} ids must be unique`,
      });
    }
    seen.add(item.id);
  });
  return seen;
}

// ── poll ──────────────────────────────────────────────────────────────────

const PollOptionSchema = z.strictObject({ id: BlockIdSchema, label: plainText(80) });

export const PollBlockSchema = z
  .strictObject({
    type: z.literal('poll'),
    ...interactiveBase,
    question: plainText(200),
    options: z.array(PollOptionSchema).min(2).max(L.pollOptions),
    /** How many options a viewer may pick (default 1). */
    maxChoices: z.number().int().min(1).max(L.pollOptions).optional(),
    /** When results are visible (default `after-vote`). */
    results: z.enum(['after-vote', 'always', 'hidden']).optional(),
  })
  .superRefine((block, ctx) => {
    uniqueIds(block.options, ctx, ['options'], 'Option');
    if (block.maxChoices !== undefined && block.maxChoices > block.options.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxChoices'],
        message: `There are only ${block.options.length} options`,
      });
    }
  });

// ── quiz ──────────────────────────────────────────────────────────────────

const QuizChoiceSchema = z.strictObject({ id: BlockIdSchema, label: plainText(200) });

const QuizQuestionSchema = z.strictObject({
  id: BlockIdSchema,
  prompt: markdownText(L.shortMarkdown),
  choices: z.array(QuizChoiceSchema).min(2).max(L.quizChoices),
  /** The correct choice ids; several make it a multiple-answer question. */
  answers: z.array(BlockIdSchema).min(1).max(L.quizChoices),
  explanation: markdownText(L.shortMarkdown).optional(),
});

export const QuizBlockSchema = z
  .strictObject({
    type: z.literal('quiz'),
    ...interactiveBase,
    title: plainText(120).optional(),
    questions: z.array(QuizQuestionSchema).min(1).max(L.quizQuestions),
    /** Feedback after each answer, or only at the end (default `immediate`). */
    feedback: z.enum(['immediate', 'end']).optional(),
    /** Share of correct answers needed to pass, from 0 to 1. */
    passScore: z.number().min(0).max(1).optional(),
    /** Shuffle choices with a seed derived from the block id (deterministic). */
    shuffle: z.boolean().optional(),
  })
  .superRefine((block, ctx) => {
    uniqueIds(block.questions, ctx, ['questions'], 'Question');
    block.questions.forEach((question, q) => {
      const choices = uniqueIds(question.choices, ctx, ['questions', q, 'choices'], 'Choice');
      const answers = new Set<string>();
      question.answers.forEach((answer, a) => {
        if (!choices.has(answer)) {
          ctx.addIssue({
            code: 'custom',
            path: ['questions', q, 'answers', a],
            message: `"${answer}" is not one of this question's choice ids`,
          });
        } else if (answers.has(answer)) {
          ctx.addIssue({
            code: 'custom',
            path: ['questions', q, 'answers', a],
            message: 'List each answer once',
          });
        }
        answers.add(answer);
      });
    });
  });

// ── calculator ────────────────────────────────────────────────────────────

const finite = z.number().finite().min(-1e12).max(1e12);

const CalculatorInputSchema = z
  .strictObject({
    /** The formula variable this input sets. */
    name: FormulaVariableNameSchema,
    label: plainText(80),
    control: z.enum(['slider', 'number']).optional(),
    min: finite,
    max: finite,
    step: z.number().finite().positive().optional(),
    default: finite,
    unit: z.enum(['number', 'compact', 'cents', 'percent']).optional(),
    help: plainText(200).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.min >= input.max) {
      ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must be greater than min' });
      return;
    }
    if (input.default < input.min || input.default > input.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'default must be within min and max',
      });
    }
    if (input.step !== undefined && (input.max - input.min) / input.step > L.calculatorSteps) {
      ctx.addIssue({
        code: 'custom',
        path: ['step'],
        message: `A slider has at most ${L.calculatorSteps} steps; use a larger step`,
      });
    }
  });

const CalculatorOutputSchema = z.strictObject({
  id: BlockIdSchema,
  label: plainText(80),
  formula: NumberFormulaSchema,
  unit: z.enum(['number', 'compact', 'cents', 'percent']).optional(),
  /** Show this output larger than the others. */
  emphasis: z.boolean().optional(),
  tone: BlockToneSchema.optional(),
});

export const CalculatorBlockSchema = z
  .strictObject({
    type: z.literal('calculator'),
    ...interactiveBase,
    title: plainText(120).optional(),
    description: markdownText(L.shortMarkdown).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code')
      .optional(),
    inputs: z.array(CalculatorInputSchema).min(1).max(L.calculatorInputs),
    outputs: z.array(CalculatorOutputSchema).min(1).max(L.calculatorOutputs),
    /** Plot one output while one input sweeps its range. */
    chart: z
      .strictObject({
        output: BlockIdSchema,
        input: FormulaVariableNameSchema,
        kind: z.enum(['line', 'area', 'bar']).optional(),
        points: z.number().int().min(2).max(L.calculatorChartPoints).optional(),
      })
      .optional(),
  })
  .superRefine((block, ctx) => {
    const names = new Set<string>();
    block.inputs.forEach((input, i) => {
      if (names.has(input.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['inputs', i, 'name'],
          message: 'Input names must be unique',
        });
      }
      names.add(input.name);
    });
    const outputs = uniqueIds(block.outputs, ctx, ['outputs'], 'Output');
    block.outputs.forEach((output, o) => {
      // The formula engine enforces its node and depth caps and that every
      // variable is one of the inputs; its diagnostics keep their paths.
      const parsed = parseFormula(output.formula, { variables: [...names] });
      for (const diagnostic of parsed.diagnostics) {
        ctx.addIssue({
          code: 'custom',
          path: ['outputs', o, 'formula', ...diagnostic.path],
          message: `${diagnostic.message}. ${diagnostic.hint}`,
        });
      }
    });
    if (block.chart) {
      if (!outputs.has(block.chart.output)) {
        ctx.addIssue({
          code: 'custom',
          path: ['chart', 'output'],
          message: 'Name one of the output ids',
        });
      }
      if (!names.has(block.chart.input)) {
        ctx.addIssue({
          code: 'custom',
          path: ['chart', 'input'],
          message: 'Name one of the input names',
        });
      }
    }
  });

// ── counter ───────────────────────────────────────────────────────────────

const integer = z.number().int().min(-1_000_000_000).max(1_000_000_000);

export const CounterBlockSchema = z
  .strictObject({
    type: z.literal('counter'),
    ...interactiveBase,
    label: plainText(80),
    start: integer.optional(),
    step: z.number().int().min(1).max(1_000_000).optional(),
    min: integer.optional(),
    max: integer.optional(),
    unit: plainText(24).optional(),
  })
  .superRefine((block, ctx) => {
    const start = block.start ?? 0;
    if (block.min !== undefined && block.max !== undefined && block.min >= block.max) {
      ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must be greater than min' });
    }
    if (
      (block.min !== undefined && start < block.min) ||
      (block.max !== undefined && start > block.max)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['start'],
        message: 'start must be within min and max',
      });
    }
  });

// ── chart with controls ───────────────────────────────────────────────────

const CARTESIAN = ['line', 'area', 'bar'] as const;
const PART_WHOLE = ['donut', 'pie', 'funnel'] as const;

export const ChartControlsBlockSchema = z
  .strictObject({
    type: z.literal('chart-controls'),
    ...interactiveBase,
    spec: ChartSpecSchema,
    /** Chart kinds the viewer may switch between; the spec's kind comes first. */
    kinds: z
      .array(z.enum([...CARTESIAN, ...PART_WHOLE]))
      .min(2)
      .max(4)
      .optional(),
    /** Let the viewer show and hide series. */
    seriesToggle: z.boolean().optional(),
    /** Let the viewer narrow the label range. */
    range: z.boolean().optional(),
    height: z.enum(['sm', 'md', 'lg']).optional(),
  })
  .superRefine((block, ctx) => {
    if (!block.kinds && !block.seriesToggle && !block.range) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Enable at least one control (kinds, seriesToggle or range), or use a chart block',
      });
    }
    if (block.kinds) {
      if (new Set(block.kinds).size !== block.kinds.length) {
        ctx.addIssue({ code: 'custom', path: ['kinds'], message: 'List each kind once' });
      }
      if (!block.kinds.includes(block.spec.kind)) {
        ctx.addIssue({
          code: 'custom',
          path: ['kinds'],
          message: `Include the spec's kind "${block.spec.kind}"`,
        });
      }
      const multiSeries = block.spec.series.length > 1;
      const negative = block.spec.series.some((s) => s.values.some((v) => v === null || v < 0));
      block.kinds.forEach((kind, i) => {
        if ((PART_WHOLE as readonly string[]).includes(kind) && (multiSeries || negative)) {
          ctx.addIssue({
            code: 'custom',
            path: ['kinds', i],
            message: `A ${kind} chart needs one series of non-negative numbers`,
          });
        }
      });
    }
    if (block.seriesToggle && block.spec.series.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['seriesToggle'],
        message: 'Toggling series needs at least two series',
      });
    }
    if (block.range && block.spec.labels.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['range'],
        message: 'A range control needs at least three labels',
      });
    }
  });

// ── map ───────────────────────────────────────────────────────────────────

/**
 * Fictional basemaps that ship with `@protoyard/views/map`. A map block never
 * loads tiles or geocodes: points are plain coordinates on a simulated map.
 */
export const MAP_BASEMAPS = ['port-meridian'] as const;

const MapPointSchema = z.strictObject({
  id: BlockIdSchema,
  label: plainText(80),
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-85.06).max(85.06),
  description: plainText(200).optional(),
  icon: IconNameSchema.optional(),
  tone: BlockToneSchema.optional(),
});

export const MapBlockSchema = z
  .strictObject({
    type: z.literal('map'),
    ...interactiveBase,
    /** Accessible name of the map. */
    label: plainText(120),
    title: plainText(120).optional(),
    basemap: z.enum(MAP_BASEMAPS).optional(),
    points: z.array(MapPointSchema).min(1).max(L.mapPoints),
    /** Point ids to join with a route line, in order. */
    route: z.array(BlockIdSchema).min(2).max(L.mapRoute).optional(),
  })
  .superRefine((block, ctx) => {
    const ids = uniqueIds(block.points, ctx, ['points'], 'Point');
    block.route?.forEach((id, i) => {
      if (!ids.has(id))
        ctx.addIssue({ code: 'custom', path: ['route', i], message: 'Name one of the point ids' });
    });
  });

// ── embedded app ──────────────────────────────────────────────────────────

/** What makes embedded app JSON unacceptable, or `null`. Walks iteratively with caps. */
export function embeddedAppProblem(
  app: unknown
): { path: (string | number)[]; message: string } | null {
  let text: string | undefined;
  try {
    text = JSON.stringify(app);
  } catch {
    return { path: [], message: 'The embedded app must be plain JSON (no cycles)' };
  }
  if (text === undefined || app === null || typeof app !== 'object' || Array.isArray(app)) {
    return { path: [], message: 'The embedded app must be a blueprint object' };
  }
  if (new TextEncoder().encode(text).length > L.embedBytes) {
    return {
      path: [],
      message: `The embedded app must be at most ${L.embedBytes / 1024} KB of JSON`,
    };
  }
  const kind = (app as Record<string, unknown>).kind;
  if (kind !== undefined && kind !== 'app') {
    return {
      path: ['kind'],
      message: 'Only an app blueprint can be embedded (no decks, pages or docs)',
    };
  }
  const stack: { value: unknown; depth: number; path: (string | number)[] }[] = [
    { value: app, depth: 1, path: [] },
  ];
  while (stack.length > 0) {
    const { value, depth, path } = stack.pop() as (typeof stack)[number];
    if (value === null || typeof value !== 'object') continue;
    if (depth > L.embedDepth) {
      return { path, message: `The embedded app nests at most ${L.embedDepth} levels` };
    }
    if (!Array.isArray(value) && (value as Record<string, unknown>).type === 'embed-app') {
      return { path, message: 'An embedded app cannot embed another app' };
    }
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value);
    for (const [key, child] of entries)
      stack.push({ value: child, depth: depth + 1, path: [...path, key] });
  }
  return null;
}

export const EmbedAppBlockSchema = z
  .strictObject({
    type: z.literal('embed-app'),
    ...interactiveBase,
    /** Accessible name of the embedded app's frame. */
    title: plainText(80),
    /** The start button's text (default "Start the app"). */
    startLabel: plainText(40).optional(),
    height: z.enum(['sm', 'md', 'lg']).optional(),
    /**
     * An app blueprint, kept opaque here: the host validates it with the
     * blueprint's untrusted loader and mounts it in its own namespace.
     */
    app: z.record(z.string(), z.unknown()),
  })
  .superRefine((block, ctx) => {
    const problem = embeddedAppProblem(block.app);
    if (problem)
      ctx.addIssue({ code: 'custom', path: ['app', ...problem.path], message: problem.message });
  });

// ── form ──────────────────────────────────────────────────────────────────

export const FORM_FIELD_TYPES = [
  'text',
  'longText',
  'email',
  'url',
  'phone',
  'number',
  'boolean',
  'enum',
  'tags',
] as const;

const TEXT_TYPES = new Set(['text', 'longText', 'email', 'url', 'phone']);

const FormOptionSchema = z.strictObject({
  value: z.string().regex(/^[\w-]{1,64}$/, 'Use 1–64 letters, digits, hyphens or underscores'),
  label: plainText(80),
});

const FormFieldSchema = z
  .strictObject({
    /** The response key: lowerCamelCase, unique in the form. */
    name: FormulaVariableNameSchema,
    label: plainText(80),
    type: z.enum(FORM_FIELD_TYPES),
    required: z.boolean().optional(),
    help: plainText(200).optional(),
    placeholder: plainText(80).optional(),
    /** `enum` choices. */
    options: z.array(FormOptionSchema).min(2).max(L.formOptions).optional(),
    /** `number` bounds. */
    min: finite.optional(),
    max: finite.optional(),
    /** Text length cap (text-like types). */
    maxLength: z.number().int().min(1).max(L.formTextLength).optional(),
    /** `tags` count cap. */
    maxTags: z.number().int().min(1).max(L.formTags).optional(),
  })
  .superRefine((field, ctx) => {
    const only = (
      key: 'options' | 'min' | 'max' | 'maxLength' | 'maxTags',
      allowed: boolean,
      what: string
    ) => {
      if (field[key] !== undefined && !allowed) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} applies only to ${what} fields`,
        });
      }
    };
    only('options', field.type === 'enum', 'enum');
    only('min', field.type === 'number', 'number');
    only('max', field.type === 'number', 'number');
    only('maxLength', TEXT_TYPES.has(field.type), 'text');
    only('maxTags', field.type === 'tags', 'tags');
    if (field.type === 'enum') {
      if (!field.options) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'An enum field needs options' });
      } else {
        const values = new Set<string>();
        field.options.forEach((option, i) => {
          if (values.has(option.value)) {
            ctx.addIssue({
              code: 'custom',
              path: ['options', i, 'value'],
              message: 'Option values must be unique',
            });
          }
          values.add(option.value);
        });
      }
    }
    if (field.min !== undefined && field.max !== undefined && field.min >= field.max) {
      ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must be greater than min' });
    }
    if (field.type === 'boolean' && field.placeholder !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['placeholder'],
        message: 'A boolean field has no placeholder',
      });
    }
  });

/**
 * A form block: the schema of a public form. `@protoyard/pages` owns the
 * responses (stored through its services), `@protoyard/pages-ui` the UI.
 */
export const FormBlockSchema = z
  .strictObject({
    type: z.literal('form'),
    ...interactiveBase,
    title: plainText(120).optional(),
    description: markdownText(L.shortMarkdown).optional(),
    fields: z.array(FormFieldSchema).min(1).max(L.formFields),
    submitLabel: plainText(40),
    successMessage: plainText(200),
  })
  .superRefine((block, ctx) => {
    const names = new Set<string>();
    block.fields.forEach((field, i) => {
      if (names.has(field.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'name'],
          message: 'Field names must be unique',
        });
      }
      names.add(field.name);
    });
  });
