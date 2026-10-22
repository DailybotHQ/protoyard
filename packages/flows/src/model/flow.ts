import { z } from 'zod';
import { inspectPlainData } from './data.ts';
import { FLOW_LIMITS } from './limits.ts';
import { FlowIdSchema } from './refs.ts';
import { type Step, StepSchema } from './steps.ts';
import { type Trigger, TriggerSchema } from './triggers.ts';
import { type FlowDiagnostic, validateFlow } from './validate.ts';
import { formatPath, listSteps } from './walk.ts';

export const FLOW_FORMAT_VERSION = 1;
export const FLOW_STATUSES = ['draft', 'active', 'paused'] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export const CollectionSchema = z.strictObject({
  id: FlowIdSchema,
  noun: z.string().trim().min(1).max(60),
  plural: z.string().trim().min(1).max(60).optional(),
  states: z
    .array(
      z.strictObject({
        id: FlowIdSchema,
        label: z.string().trim().min(1).max(60),
        final: z.boolean().optional(),
      })
    )
    .max(FLOW_LIMITS.maxStates),
});
export type FlowCollection = z.infer<typeof CollectionSchema>;

export const ListSchema = z.strictObject({
  id: FlowIdSchema,
  name: z.string().trim().min(1).max(80),
  items: z.array(z.string().trim().min(1).max(200)).max(FLOW_LIMITS.maxListItems),
});
export type FlowList = z.infer<typeof ListSchema>;

/** A serializable workflow: how it starts, what it does, and what it keeps. */
export interface Flow {
  formatVersion: 1;
  id: string;
  name: string;
  description?: string;
  status: FlowStatus;
  triggers: Trigger[];
  steps: Step[];
  collections?: FlowCollection[];
  lists?: FlowList[];
  labels?: string[];
}

export const FlowSchema: z.ZodType<Flow> = z
  .strictObject({
    formatVersion: z.literal(FLOW_FORMAT_VERSION),
    id: FlowIdSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    status: z.enum(FLOW_STATUSES),
    triggers: z.array(TriggerSchema).min(1, 'Add a way to start').max(FLOW_LIMITS.maxTriggers),
    steps: z.array(StepSchema).max(FLOW_LIMITS.maxSteps),
    collections: z.array(CollectionSchema).max(FLOW_LIMITS.maxCollections).optional(),
    lists: z.array(ListSchema).max(FLOW_LIMITS.maxLists).optional(),
    labels: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .superRefine((flow, ctx) => {
    const all = listSteps(flow.steps);
    if (all.length > FLOW_LIMITS.maxSteps) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: `A flow holds at most ${FLOW_LIMITS.maxSteps} steps`,
      });
    }
    for (const location of all) {
      if (location.depth >= FLOW_LIMITS.maxStepDepth) {
        ctx.addIssue({
          code: 'custom',
          path: location.path,
          message: `Branches nest at most ${FLOW_LIMITS.maxStepDepth} levels`,
        });
        break;
      }
    }
  });

export type ParseFlowResult =
  | { ok: true; flow: Flow; diagnostics: FlowDiagnostic[] }
  | { ok: false; diagnostics: FlowDiagnostic[] };

/**
 * Parses untrusted input into a flow: plain-data and size checks first (no
 * recursion over hostile structures), then the strict schema, then the
 * semantic checks of `validateFlow`. Errors fail the parse; warnings ride
 * along with a successful one.
 */
export function parseFlow(input: unknown): ParseFlowResult {
  const problem = inspectPlainData(input);
  if (problem) {
    return {
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'not_plain_data', path: problem.path, message: problem.message },
      ],
    };
  }
  const parsed = FlowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        severity: 'error',
        code: 'schema',
        path:
          formatPath(issue.path.filter((s): s is string | number => typeof s !== 'symbol')) || '$',
        message: issue.message,
      })),
    };
  }
  const diagnostics = validateFlow(parsed.data);
  if (diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics };
  return { ok: true, flow: parsed.data, diagnostics };
}
