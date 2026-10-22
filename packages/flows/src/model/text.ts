import { z } from 'zod';
import { FLOW_ID_PATTERN, FLOW_LIMITS } from './limits.ts';
import { type DataRef, DataRefSchema, describeRef } from './refs.ts';

/** Text people read: a string, or parts where a part is a string or a reference. */
export type FlowText = string | (string | { ref: DataRef })[];

export const FlowTextSchema: z.ZodType<FlowText> = z.union([
  z.string().max(2_000),
  z
    .array(z.union([z.string().max(2_000), z.strictObject({ ref: DataRefSchema })]))
    .max(FLOW_LIMITS.maxTextParts),
]);

/** Every reference a text interpolates. */
export function textRefs(value: FlowText | undefined): DataRef[] {
  if (value === undefined || typeof value === 'string') return [];
  return value.flatMap((part) => (typeof part === 'string' ? [] : [part.ref]));
}

/** The text with each reference shown as `{label}`, for editors and previews. */
export function textPreview(value: FlowText | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return value
    .map((part) => (typeof part === 'string' ? part : `{${describeRef(part.ref)}}`))
    .join('');
}

export const AUDIENCE_TYPES = ['person', 'team', 'role', 'channel', 'list', 'everyone'] as const;

/** Who a step addresses. Names are display copy; ids point at fictional data. */
export interface AudienceItem {
  type: (typeof AUDIENCE_TYPES)[number];
  id: string;
  name: string;
}

export const AudienceSchema = z
  .array(
    z.strictObject({
      type: z.enum(AUDIENCE_TYPES),
      id: z.string().regex(FLOW_ID_PATTERN),
      name: z.string().trim().min(1).max(120),
    })
  )
  .max(FLOW_LIMITS.maxAudience);
