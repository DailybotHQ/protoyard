import { z } from 'zod';

/** Retention period length. Computation lands with the cohort task. */
export const RetentionIntervalSchema = z.enum(['day', 'week', 'month']);
export type RetentionInterval = z.infer<typeof RetentionIntervalSchema>;

/** How many periods a retention table shows (period 0 is the cohort itself). */
export const RetentionPeriodsSchema = z.number().int().min(1).max(52);
