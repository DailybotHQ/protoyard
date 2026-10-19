import { z } from 'zod';

/*
 * Data contracts shared by the analytics engine, its generators and the
 * analytics-ui kit. Rows are plain data so prototypes can store them in
 * Dexie and scenarios can generate them deterministically.
 */

/** Bucket size for time series. All bucketing is in UTC. */
export const GranularitySchema = z.enum(['hour', 'day', 'week', 'month']);
export type Granularity = z.infer<typeof GranularitySchema>;

/** An ISO 8601 instant with an explicit UTC offset (`2026-03-02T09:00:00.000Z`). */
const isoInstant = z.iso.datetime({ offset: true });

/** Event property values: primitives only, so filters and breakdowns stay simple. */
export const EventPropertyValueSchema = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type EventPropertyValue = z.infer<typeof EventPropertyValueSchema>;

/** One tracked product event (`signup`, `checkout_completed`, …). */
export const AnalyticsEventSchema = z.strictObject({
  id: z.string().min(1),
  type: z
    .string()
    .regex(/^[a-z][a-z0-9_.:-]{0,63}$/, 'Use a lowercase event name such as checkout_completed'),
  userId: z.string().min(1),
  at: isoInstant,
  properties: z.record(z.string(), EventPropertyValueSchema).default({}),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/** One point of a metric time series: bucket start (epoch ms, UTC) and value. */
export interface MetricPoint {
  at: number;
  value: number;
}
