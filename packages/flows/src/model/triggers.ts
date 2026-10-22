import { z } from 'zod';
import { type Condition, ConditionSchema } from './conditions.ts';
import { FORBIDDEN_KEYS } from './data.ts';
import { FlowIdSchema } from './refs.ts';
import { type AudienceItem, AudienceSchema } from './text.ts';

export const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type Day = (typeof DAYS)[number];

/** `HH:MM` on a 24-hour clock. */
export const TimeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/** `local`, `utc` or an IANA-style zone name such as `America/Bogota`. */
const TimezoneSchema = z
  .string()
  .regex(
    /^(?:local|utc|[A-Z][A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2})$/,
    'Use local, utc or a zone name'
  );

export const SURFACES = ['app', 'chat', 'command', 'link'] as const;
export const EVENT_SOURCES = ['records', 'people', 'app', 'integration'] as const;

/**
 * How a run starts. Every start is simulated: a schedule fires from the
 * simulated clock, a manual start from a button, an event or a webhook from a
 * scenario. A webhook carries a sample payload, never a secret.
 */
export type Trigger =
  | {
      id: string;
      type: 'schedule';
      days: Day[];
      time: string;
      timezone: string;
      everyWeeks?: number;
    }
  | {
      id: string;
      type: 'manual';
      label: string;
      who?: AudienceItem[];
      surfaces?: (typeof SURFACES)[number][];
      command?: string;
    }
  | {
      id: string;
      type: 'event';
      event: string;
      source?: (typeof EVENT_SOURCES)[number];
      filter?: Condition;
    }
  | { id: string; type: 'webhook'; eventType: string; samplePayload?: Record<string, unknown> };

export type TriggerType = Trigger['type'];

const EventNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_.:-]{0,63}$/, 'Use a lowercase event name such as record.created');

export const TriggerSchema: z.ZodType<Trigger> = z.discriminatedUnion('type', [
  z.strictObject({
    id: FlowIdSchema,
    type: z.literal('schedule'),
    days: z
      .array(z.enum(DAYS))
      .min(1, 'Pick at least one day')
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Each day appears once'),
    time: TimeOfDaySchema,
    timezone: TimezoneSchema,
    everyWeeks: z.number().int().min(1).max(12).optional(),
  }),
  z.strictObject({
    id: FlowIdSchema,
    type: z.literal('manual'),
    label: z.string().trim().min(1).max(80),
    who: AudienceSchema.optional(),
    surfaces: z.array(z.enum(SURFACES)).min(1).max(SURFACES.length).optional(),
    command: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,30}$/, 'Commands use lowercase letters, digits, - and _')
      .optional(),
  }),
  z.strictObject({
    id: FlowIdSchema,
    type: z.literal('event'),
    event: EventNameSchema,
    source: z.enum(EVENT_SOURCES).optional(),
    filter: ConditionSchema.optional(),
  }),
  z.strictObject({
    id: FlowIdSchema,
    type: z.literal('webhook'),
    eventType: EventNameSchema,
    samplePayload: z
      .record(
        z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,64}$/)
          .refine((key) => !FORBIDDEN_KEYS.has(key), 'This key is not allowed'),
        z.unknown()
      )
      .optional(),
  }),
]);
