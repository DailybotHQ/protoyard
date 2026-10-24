import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CliError } from './output.ts';

const SlugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

const PositiveBudgetSchema = z.number().finite().positive();

export const PerformanceBudgetSchema = z
  .object({
    initialJsGzipKb: PositiveBudgetSchema,
    cssGzipKb: PositiveBudgetSchema,
    /** Null means no cold-start threshold has been calibrated yet. */
    coldStartMs: PositiveBudgetSchema.nullable(),
    generateMs: PositiveBudgetSchema,
    indexColdMs: PositiveBudgetSchema,
    /** End-to-end idea → first paint target; null until calibrated. */
    ideaToRunningMs: PositiveBudgetSchema.nullable().default(null),
    /** Optional phase thresholds used by scripts/bench-idea.ts. */
    briefToBlueprintMs: PositiveBudgetSchema.nullable().default(null),
    blueprintValidationMs: PositiveBudgetSchema.nullable().default(null),
    prototypeGenerationMs: PositiveBudgetSchema.nullable().default(null),
    prototypeBuildMs: PositiveBudgetSchema.nullable().default(null),
    previewReadyMs: PositiveBudgetSchema.nullable().default(null),
    /** `protoyard quick` brief → ready folder → `protoyard:ready` (bench-idea --mode quick); null until calibrated. */
    quickReadyMs: PositiveBudgetSchema.nullable().default(null),
  })
  .strict();

export const PerformanceBudgetOverrideSchema = PerformanceBudgetSchema.partial().extend({
  /** Why this prototype needs its own numbers (kept with the override, never a metric). */
  reason: z.string().min(1).max(500).optional(),
});

/** Blueprint content kinds that ship their own minimal player entry (ADR-040). */
export const KIND_BUDGET_KINDS = ['deck', 'page', 'doc'] as const;
export type BudgetKind = (typeof KIND_BUDGET_KINDS)[number];

/** Budget for one per-kind player entry and its single-file export. */
export const KindBudgetSchema = z
  .object({
    initialJsGzipKb: PositiveBudgetSchema,
    cssGzipKb: PositiveBudgetSchema,
    /** Raw size of the single-file export for this kind; null until calibrated. */
    singleFileKb: PositiveBudgetSchema.nullable().default(null),
  })
  .strict();

export type KindBudget = z.infer<typeof KindBudgetSchema>;

/**
 * Provisional per-kind budgets (PLAN_005, ADR-040). Measured numbers replace them in
 * protoyard.budgets.json once the kind entries exist.
 */
export const DEFAULT_KIND_BUDGETS: Record<BudgetKind, KindBudget> = {
  deck: { initialJsGzipKb: 150, cssGzipKb: 30, singleFileKb: 1536 },
  page: { initialJsGzipKb: 150, cssGzipKb: 30, singleFileKb: null },
  doc: { initialJsGzipKb: 150, cssGzipKb: 30, singleFileKb: null },
};

const KindBudgetsSchema = z
  .object({
    deck: KindBudgetSchema.optional(),
    page: KindBudgetSchema.optional(),
    doc: KindBudgetSchema.optional(),
  })
  .strict();

export const BudgetConfigSchema = z
  .object({
    format: z.literal('protoyard.budgets'),
    version: z.literal(1),
    defaults: PerformanceBudgetSchema,
    overrides: z.record(SlugSchema, PerformanceBudgetOverrideSchema),
    /** Optional per-kind player entry budgets; missing kinds use DEFAULT_KIND_BUDGETS. */
    kinds: KindBudgetsSchema.optional(),
  })
  .strict();

export type PerformanceBudget = z.infer<typeof PerformanceBudgetSchema>;
export type PerformanceBudgetOverride = z.infer<typeof PerformanceBudgetOverrideSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

export const DEFAULT_PERFORMANCE_BUDGETS: PerformanceBudget = {
  initialJsGzipKb: 250,
  cssGzipKb: 30,
  coldStartMs: null,
  generateMs: 50,
  indexColdMs: 100,
  ideaToRunningMs: null,
  briefToBlueprintMs: null,
  blueprintValidationMs: null,
  prototypeGenerationMs: null,
  prototypeBuildMs: null,
  previewReadyMs: null,
  quickReadyMs: null,
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  format: 'protoyard.budgets',
  version: 1,
  defaults: { ...DEFAULT_PERFORMANCE_BUDGETS },
  overrides: {},
};

/** Parses and validates a versioned workspace budget document. */
export function parseBudgetConfig(value: unknown, source = 'protoyard.budgets.json'): BudgetConfig {
  const parsed = BudgetConfigSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new CliError('validation', `Invalid budget config in ${source}: ${details}`);
  }
  return parsed.data;
}

/** Loads workspace budgets, using built-in defaults when no file exists. */
export async function loadBudgets(workspaceRoot: string): Promise<BudgetConfig> {
  const path = join(workspaceRoot, 'protoyard.budgets.json');
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return structuredClone(DEFAULT_BUDGET_CONFIG);
    throw new CliError(
      'failure',
      `Could not read budget config at ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(
      'validation',
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parseBudgetConfig(value, path);
}

/** Applies the selected prototype override to the workspace defaults. */
export function resolveBudget(config: BudgetConfig, slug: string): PerformanceBudget {
  const { reason: _reason, ...override } = config.overrides[slug] ?? {};
  return { ...config.defaults, ...override };
}

/** Resolves the budget of one per-kind player entry, falling back to the provisional defaults. */
export function resolveKindBudget(config: BudgetConfig, kind: BudgetKind): KindBudget {
  return { ...DEFAULT_KIND_BUDGETS[kind], ...config.kinds?.[kind] };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
