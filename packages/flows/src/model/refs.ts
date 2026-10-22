import { z } from 'zod';
import { FORBIDDEN_KEYS } from './data.ts';
import { FLOW_ID_PATTERN, FLOW_LIMITS } from './limits.ts';

/**
 * A reference to data a run has at hand: a field of what started it
 * (`trigger`), the output of an earlier step (`step`), or the record the run
 * is about (`record`). The path is a list of plain segments, never an
 * expression, and only own properties are read.
 */
export type DataRef =
  | { from: 'trigger'; path?: string[] }
  | { from: 'step'; stepId: string; path?: string[] }
  | { from: 'record'; path?: string[] };

export const FlowIdSchema = z.string().regex(FLOW_ID_PATTERN, 'Use a lowercase slug id');

const SegmentSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Use letters, digits, - or _ in a path segment')
  .refine((segment) => !FORBIDDEN_KEYS.has(segment), 'This path segment is not allowed');

const PathSchema = z.array(SegmentSchema).min(1).max(FLOW_LIMITS.maxPathSegments).optional();

export const DataRefSchema: z.ZodType<DataRef> = z.discriminatedUnion('from', [
  z.strictObject({ from: z.literal('trigger'), path: PathSchema }),
  z.strictObject({ from: z.literal('step'), stepId: FlowIdSchema, path: PathSchema }),
  z.strictObject({ from: z.literal('record'), path: PathSchema }),
]);

/** What a run offers references: its trigger payload, step outputs and record. */
export interface RefScope {
  trigger?: unknown;
  outputs?: Readonly<Record<string, unknown>>;
  record?: unknown;
}

function readPath(root: unknown, path: readonly string[] | undefined): unknown {
  let value = root;
  for (const segment of path ?? []) {
    if (value === null || typeof value !== 'object' || FORBIDDEN_KEYS.has(segment)) {
      return undefined;
    }
    if (!Object.hasOwn(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** Reads a reference from a run scope; anything missing is `undefined`. */
export function resolveRef(ref: DataRef, scope: RefScope = {}): unknown {
  switch (ref.from) {
    case 'trigger':
      return readPath(scope.trigger, ref.path);
    case 'record':
      return readPath(scope.record, ref.path);
    case 'step': {
      const outputs = scope.outputs ?? {};
      if (!Object.hasOwn(outputs, ref.stepId)) return undefined;
      return readPath(outputs[ref.stepId], ref.path);
    }
  }
}

/** A short human label: `trigger.payload.status`, `step check.result`, `record.state`. */
export function describeRef(ref: DataRef): string {
  const tail = ref.path?.length ? `.${ref.path.join('.')}` : '';
  if (ref.from === 'step') return `step ${ref.stepId}${tail}`;
  return `${ref.from}${tail}`;
}
