import { z } from 'zod';
import { inspectPlainData } from './data.ts';
import { CollectionSchema, FLOW_STATUSES, type Flow, ListSchema, parseFlow } from './flow.ts';
import { FLOW_ID_PATTERN, FLOW_LIMITS } from './limits.ts';
import { FlowIdSchema } from './refs.ts';
import { QuestionSchema, type Step, StepSchema } from './steps.ts';
import { TriggerSchema } from './triggers.ts';
import type { FlowDiagnostic } from './validate.ts';
import { type BranchArm, childArms, listSteps } from './walk.ts';

/*
 * Edits on a flow. Direct manipulation, a composer and an agent all go
 * through `applyOperations`, so there is one way to change a flow: the batch
 * is validated, applied to a copy, and the result must parse as a flow, or
 * nothing changes.
 */

const BranchArmSchema = z.enum(['then', 'otherwise']);
const IndexSchema = z.number().int().min(0).max(FLOW_LIMITS.maxSteps);

/** A shallow patch for a step: any step field except its id and type. */
const StepPatchSchema = z
  .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/), z.unknown())
  .refine((patch) => !('id' in patch) && !('type' in patch), 'A patch cannot change id or type');

export const OperationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('update_flow'),
    patch: z.strictObject({
      name: z.string().optional(),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
    }),
  }),
  z.strictObject({ op: z.literal('set_status'), status: z.enum(FLOW_STATUSES) }),
  z.strictObject({
    op: z.literal('add_trigger'),
    trigger: TriggerSchema,
    index: IndexSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('replace_trigger'),
    triggerId: FlowIdSchema,
    trigger: TriggerSchema,
  }),
  z.strictObject({ op: z.literal('remove_trigger'), triggerId: FlowIdSchema }),
  z.strictObject({
    op: z.literal('add_step'),
    step: StepSchema,
    parentId: FlowIdSchema.optional(),
    branch: BranchArmSchema.optional(),
    index: IndexSchema.optional(),
  }),
  z.strictObject({ op: z.literal('update_step'), stepId: FlowIdSchema, patch: StepPatchSchema }),
  z.strictObject({ op: z.literal('remove_step'), stepId: FlowIdSchema }),
  z.strictObject({
    op: z.literal('move_step'),
    stepId: FlowIdSchema,
    parentId: FlowIdSchema.optional(),
    branch: BranchArmSchema.optional(),
    index: IndexSchema,
  }),
  z.strictObject({ op: z.literal('duplicate_step'), stepId: FlowIdSchema }),
  z.strictObject({
    op: z.literal('add_question'),
    stepId: FlowIdSchema,
    question: QuestionSchema,
    index: IndexSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('remove_question'),
    stepId: FlowIdSchema,
    questionId: FlowIdSchema,
  }),
  z.strictObject({ op: z.literal('upsert_collection'), collection: CollectionSchema }),
  z.strictObject({ op: z.literal('remove_collection'), collectionId: FlowIdSchema }),
  z.strictObject({ op: z.literal('upsert_list'), list: ListSchema }),
  z.strictObject({ op: z.literal('remove_list'), listId: FlowIdSchema }),
]);

export type FlowOperation = z.infer<typeof OperationSchema>;

export type ApplyOperationsResult =
  | { ok: true; flow: Flow; diagnostics: FlowDiagnostic[] }
  | { ok: false; flow: Flow; failedAt: number | null; diagnostics: FlowDiagnostic[] };

class OperationError extends Error {}

const fail = (message: string): never => {
  throw new OperationError(message);
};

/** The list a step lives in (top level or a branch arm), resolved by parent id. */
function containerOf(
  flow: Flow,
  parentId: string | undefined,
  branch: BranchArm | undefined
): Step[] {
  if (parentId === undefined) {
    if (branch !== undefined) fail('A branch arm needs a parentId');
    return flow.steps;
  }
  const parent = listSteps(flow.steps).find((l) => l.step.id === parentId)?.step;
  if (!parent) return fail(`No step has the id "${parentId}"`);
  const arm = childArms(parent).find((a) => a.branch === (branch ?? 'then'));
  if (!arm) return fail(`Step "${parentId}" is not a branch`);
  return arm.steps;
}

/** The list holding a step and its index there. */
function locate(flow: Flow, stepId: string): { list: Step[]; index: number; step: Step } {
  const visit = (list: Step[]): { list: Step[]; index: number; step: Step } | null => {
    for (const [index, step] of list.entries()) {
      if (step.id === stepId) return { list, index, step };
      for (const arm of childArms(step)) {
        const found = visit(arm.steps);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(flow.steps) ?? fail(`No step has the id "${stepId}"`);
}

/** A free id derived from `base`: `base-copy`, `base-copy-2`… within the slug pattern. */
function freeId(base: string, taken: Set<string>): string {
  for (let n = 1; n < 10_000; n += 1) {
    const suffix = n === 1 ? '-copy' : `-copy-${n}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (FLOW_ID_PATTERN.test(candidate) && !taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  return fail('No free id for the copy');
}

/** Deep copy with every step id (nested ones too) renamed to a free id. */
function copyWithFreshIds(step: Step, taken: Set<string>): Step {
  const copy = structuredClone(step);
  const rename = (s: Step) => {
    s.id = freeId(s.id, taken);
    for (const arm of childArms(s)) arm.steps.forEach(rename);
  };
  rename(copy);
  return copy;
}

const insertAt = <T>(list: T[], item: T, index: number | undefined) => {
  list.splice(index === undefined ? list.length : Math.min(index, list.length), 0, item);
};

function apply(flow: Flow, operation: FlowOperation): void {
  switch (operation.op) {
    case 'update_flow':
      Object.assign(flow, operation.patch);
      return;
    case 'set_status':
      flow.status = operation.status;
      return;
    case 'add_trigger':
      insertAt(flow.triggers, operation.trigger, operation.index);
      return;
    case 'replace_trigger': {
      const index = flow.triggers.findIndex((t) => t.id === operation.triggerId);
      if (index < 0) fail(`No start has the id "${operation.triggerId}"`);
      flow.triggers[index] = operation.trigger;
      return;
    }
    case 'remove_trigger': {
      const index = flow.triggers.findIndex((t) => t.id === operation.triggerId);
      if (index < 0) fail(`No start has the id "${operation.triggerId}"`);
      flow.triggers.splice(index, 1);
      return;
    }
    case 'add_step':
      insertAt(
        containerOf(flow, operation.parentId, operation.branch),
        operation.step,
        operation.index
      );
      return;
    case 'update_step': {
      const { list, index, step } = locate(flow, operation.stepId);
      const next: Record<string, unknown> = { ...step };
      for (const [key, value] of Object.entries(operation.patch)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      // The merged step is re-validated with the whole flow at the end.
      list[index] = next as unknown as Step;
      return;
    }
    case 'remove_step': {
      const { list, index } = locate(flow, operation.stepId);
      list.splice(index, 1);
      return;
    }
    case 'move_step': {
      const { list, index, step } = locate(flow, operation.stepId);
      if (operation.parentId !== undefined) {
        const inside = listSteps([step]).some((l) => l.step.id === operation.parentId);
        if (inside) fail('A step cannot move inside itself');
      }
      list.splice(index, 1);
      insertAt(containerOf(flow, operation.parentId, operation.branch), step, operation.index);
      return;
    }
    case 'duplicate_step': {
      const { list, index, step } = locate(flow, operation.stepId);
      const taken = new Set(listSteps(flow.steps).map((l) => l.step.id));
      list.splice(index + 1, 0, copyWithFreshIds(step, taken));
      return;
    }
    case 'add_question': {
      const { step } = locate(flow, operation.stepId);
      if (step.type !== 'ask') {
        throw new OperationError(`Step "${operation.stepId}" does not ask questions`);
      }
      insertAt(step.questions, operation.question, operation.index);
      return;
    }
    case 'remove_question': {
      const { step } = locate(flow, operation.stepId);
      if (step.type !== 'ask') {
        throw new OperationError(`Step "${operation.stepId}" does not ask questions`);
      }
      const index = step.questions.findIndex((q) => q.id === operation.questionId);
      if (index < 0) fail(`No question has the id "${operation.questionId}"`);
      step.questions.splice(index, 1);
      return;
    }
    case 'upsert_collection': {
      flow.collections ??= [];
      const list = flow.collections;
      const index = list.findIndex((c) => c.id === operation.collection.id);
      if (index < 0) list.push(operation.collection);
      else list[index] = operation.collection;
      return;
    }
    case 'remove_collection': {
      const list = flow.collections ?? [];
      const index = list.findIndex((c) => c.id === operation.collectionId);
      if (index < 0) fail(`No collection has the id "${operation.collectionId}"`);
      list.splice(index, 1);
      return;
    }
    case 'upsert_list': {
      flow.lists ??= [];
      const list = flow.lists;
      const index = list.findIndex((l) => l.id === operation.list.id);
      if (index < 0) list.push(operation.list);
      else list[index] = operation.list;
      return;
    }
    case 'remove_list': {
      const list = flow.lists ?? [];
      const index = list.findIndex((l) => l.id === operation.listId);
      if (index < 0) fail(`No list has the id "${operation.listId}"`);
      list.splice(index, 1);
      return;
    }
  }
}

const opDiagnostic = (
  index: number,
  message: string,
  code: FlowDiagnostic['code'] = 'schema'
): FlowDiagnostic => ({
  severity: 'error',
  code,
  path: `operations[${index}]`,
  message,
});

/**
 * Applies a batch of edits atomically. Operations are untrusted input and
 * validated first; each runs on a copy; the result must parse as a flow
 * (schema and semantic errors). On any failure the original flow is returned
 * untouched with the diagnostics and the failing operation index (null when
 * only the final flow is invalid).
 */
export function applyOperations(flow: Flow, operations: unknown): ApplyOperationsResult {
  const problem = inspectPlainData(operations);
  if (problem) {
    return {
      ok: false,
      flow,
      failedAt: null,
      diagnostics: [opDiagnostic(0, problem.message, 'not_plain_data')],
    };
  }
  const parsed = z.array(OperationSchema).max(FLOW_LIMITS.maxOperations).safeParse(operations);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const index = typeof first?.path[0] === 'number' ? first.path[0] : 0;
    return {
      ok: false,
      flow,
      failedAt: index,
      diagnostics: parsed.error.issues.map((issue) =>
        opDiagnostic(typeof issue.path[0] === 'number' ? issue.path[0] : 0, issue.message)
      ),
    };
  }
  const draft = structuredClone(flow);
  for (const [index, operation] of parsed.data.entries()) {
    try {
      apply(draft, operation);
    } catch (error) {
      if (!(error instanceof OperationError)) throw error;
      return {
        ok: false,
        flow,
        failedAt: index,
        diagnostics: [opDiagnostic(index, error.message)],
      };
    }
  }
  const result = parseFlow(draft);
  if (!result.ok) return { ok: false, flow, failedAt: null, diagnostics: result.diagnostics };
  return { ok: true, flow: result.flow, diagnostics: result.diagnostics };
}
