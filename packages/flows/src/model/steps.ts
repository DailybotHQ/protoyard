import { z } from 'zod';
import { type Condition, ConditionSchema } from './conditions.ts';
import { FLOW_ID_PATTERN, FLOW_LIMITS } from './limits.ts';
import { DataRefSchema, FlowIdSchema } from './refs.ts';
import { AudienceSchema, FlowTextSchema } from './text.ts';
import { TimeOfDaySchema } from './triggers.ts';

/*
 * The step catalog. Every step is plain data that a runtime turns into a
 * proposed effect for a service adapter (ADR-041): there is no step that
 * holds code, a URL, headers or credentials, so a flow can never execute
 * JavaScript or reach a network on its own.
 */

const MINUTES_PER_YEAR = 525_600;

const common = {
  id: FlowIdSchema,
  /** A display name that wins over the derived sentence. */
  label: z.string().trim().min(1).max(120).optional(),
  /** Absent means enabled. */
  enabled: z.boolean().optional(),
  /** "Only if": the step is skipped when this fails. */
  only: ConditionSchema.optional(),
  /** Simulated minutes to wait before the step starts. */
  delayMinutes: z.number().int().min(0).max(MINUTES_PER_YEAR).optional(),
};

export const QUESTION_KINDS = ['text', 'choice', 'boolean', 'number'] as const;

export const QuestionSchema = z.strictObject({
  id: FlowIdSchema,
  kind: z.enum(QUESTION_KINDS),
  prompt: z.string().trim().min(1).max(500),
  required: z.boolean().optional(),
  choices: z.array(z.string().trim().min(1).max(120)).max(FLOW_LIMITS.maxChoices).optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

const fieldsSchema = z
  .record(z.string().regex(FLOW_ID_PATTERN, 'Field names are lowercase slugs'), FlowTextSchema)
  .refine((fields) => Object.keys(fields).length <= 30, 'At most 30 fields');

const LEAF_STEP_SCHEMAS = [
  z.strictObject({
    ...common,
    type: z.literal('ask'),
    audience: AudienceSchema.min(1, 'Ask someone'),
    questions: z.array(QuestionSchema).min(1, 'Add a question').max(FLOW_LIMITS.maxQuestions),
    deadlineMinutes: z.number().int().min(1).max(MINUTES_PER_YEAR).optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('approval'),
    approvers: AudienceSchema.min(1, 'Choose who approves'),
    prompt: FlowTextSchema,
  }),
  z.strictObject({
    ...common,
    type: z.literal('wait'),
    minutes: z.number().int().min(1).max(MINUTES_PER_YEAR),
  }),
  z.strictObject({
    ...common,
    type: z.literal('wait_until'),
    until: z.enum(['replies', 'approval', 'event', 'time']),
    time: TimeOfDaySchema.optional(),
    event: z
      .string()
      .regex(/^[a-z][a-z0-9_.:-]{0,63}$/)
      .optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('message'),
    channel: z.enum(['chat', 'email', 'inbox', 'notification']),
    to: AudienceSchema.min(1, 'Choose who gets it'),
    subject: z.string().trim().min(1).max(200).optional(),
    text: FlowTextSchema,
  }),
  z.strictObject({
    ...common,
    type: z.literal('reply'),
    text: FlowTextSchema,
  }),
  z.strictObject({
    ...common,
    type: z.literal('assistant'),
    task: z.enum(['summarize', 'classify', 'extract', 'draft', 'check']),
    input: DataRefSchema.optional(),
    instructions: FlowTextSchema.optional(),
    labels: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('save_record'),
    collection: FlowIdSchema,
    title: FlowTextSchema.optional(),
    fields: fieldsSchema.optional(),
    state: FlowIdSchema.optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('get_records'),
    collection: FlowIdSchema,
    sinceDays: z.number().int().min(1).max(366),
    limit: z.number().int().min(1).max(500),
  }),
  z.strictObject({
    ...common,
    type: z.literal('set_state'),
    state: FlowIdSchema,
  }),
  z.strictObject({
    ...common,
    type: z.literal('pick_from_list'),
    list: FlowIdSchema,
    order: z.enum(['next_unused', 'seeded']),
  }),
  z.strictObject({
    ...common,
    type: z.literal('update_list'),
    list: FlowIdSchema,
    action: z.enum(['add', 'remove']),
    value: FlowTextSchema,
  }),
  z.strictObject({
    ...common,
    type: z.literal('group_people'),
    from: AudienceSchema.min(1, 'Choose who to group'),
    mode: z.enum(['pairs', 'groups', 'pick_one']),
    size: z.number().int().min(2).max(20).optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('call_tool'),
    /** A tool the prototype registers with its service adapter, by id. */
    tool: FlowIdSchema,
    action: FlowIdSchema,
    input: fieldsSchema.optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('start_flow'),
    flowId: FlowIdSchema,
  }),
] as const;

type LeafStep = z.infer<(typeof LEAF_STEP_SCHEMAS)[number]>;

/** A branch: `then` runs when `when` passes, `otherwise` when it fails. */
export interface BranchStep {
  id: string;
  type: 'branch';
  label?: string;
  enabled?: boolean;
  only?: Condition;
  delayMinutes?: number;
  when: Condition;
  then: Step[];
  otherwise: Step[];
}

export type Step = LeafStep | BranchStep;
export type StepType = Step['type'];
export type StepOf<T extends StepType> = Extract<Step, { type: T }>;

export const StepSchema: z.ZodType<Step> = z.lazy(() =>
  z.discriminatedUnion('type', [
    ...LEAF_STEP_SCHEMAS,
    z.strictObject({
      ...common,
      type: z.literal('branch'),
      when: ConditionSchema,
      // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
      then: z.array(StepSchema).max(FLOW_LIMITS.maxSteps),
      otherwise: z.array(StepSchema).max(FLOW_LIMITS.maxSteps),
    }),
  ])
);

/* ---------- registry ---------- */

export type StepCategory = 'people' | 'timing' | 'logic' | 'messages' | 'data' | 'tools';

export interface StepKind {
  type: StepType;
  label: string;
  category: StepCategory;
  /** What the step leaves for later steps to reference. */
  output: 'replies' | 'decision' | 'text' | 'records' | 'item' | 'group' | 'none';
  /** True when a runtime turns it into a proposed effect (a message, a saved record…). */
  effect: boolean;
}

/** One entry per step type, in editor order. */
export const STEP_KINDS: readonly StepKind[] = [
  { type: 'ask', label: 'Ask questions', category: 'people', output: 'replies', effect: true },
  {
    type: 'approval',
    label: 'Ask for approval',
    category: 'people',
    output: 'decision',
    effect: true,
  },
  {
    type: 'group_people',
    label: 'Group people',
    category: 'people',
    output: 'group',
    effect: false,
  },
  { type: 'wait', label: 'Wait', category: 'timing', output: 'none', effect: false },
  { type: 'wait_until', label: 'Wait until', category: 'timing', output: 'none', effect: false },
  { type: 'branch', label: 'If / otherwise', category: 'logic', output: 'none', effect: false },
  { type: 'message', label: 'Send a message', category: 'messages', output: 'none', effect: true },
  { type: 'reply', label: 'Reply', category: 'messages', output: 'none', effect: true },
  { type: 'assistant', label: 'Assistant task', category: 'tools', output: 'text', effect: false },
  {
    type: 'save_record',
    label: 'Save a record',
    category: 'data',
    output: 'records',
    effect: true,
  },
  { type: 'get_records', label: 'Get records', category: 'data', output: 'records', effect: false },
  { type: 'set_state', label: 'Change state', category: 'data', output: 'none', effect: true },
  {
    type: 'pick_from_list',
    label: 'Pick from a list',
    category: 'data',
    output: 'item',
    effect: true,
  },
  { type: 'update_list', label: 'Update a list', category: 'data', output: 'none', effect: true },
  { type: 'call_tool', label: 'Use a tool', category: 'tools', output: 'text', effect: true },
  {
    type: 'start_flow',
    label: 'Start another flow',
    category: 'tools',
    output: 'none',
    effect: true,
  },
];

export const STEP_TYPES: readonly StepType[] = STEP_KINDS.map((kind) => kind.type);

export function stepKind(type: StepType): StepKind {
  return STEP_KINDS.find((kind) => kind.type === type) as StepKind;
}

export function isStepEnabled(step: Step): boolean {
  return step.enabled !== false;
}
