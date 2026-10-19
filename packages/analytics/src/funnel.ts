import { z } from 'zod';

/** One ordered funnel step, matched by event type. Computation lands with the funnel task. */
export const FunnelStepSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1).max(60),
  eventType: z.string().min(1),
});
export type FunnelStep = z.infer<typeof FunnelStepSchema>;

/** A funnel needs at least two steps and unique step ids. */
export const FunnelDefinitionSchema = z
  .array(FunnelStepSchema)
  .min(2, 'A funnel needs at least two steps')
  .max(12)
  .refine((steps) => new Set(steps.map((s) => s.id)).size === steps.length, {
    message: 'Funnel step ids must be unique',
  });
export type FunnelDefinition = z.infer<typeof FunnelDefinitionSchema>;
