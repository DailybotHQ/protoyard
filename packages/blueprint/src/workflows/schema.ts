import { z } from 'zod';

const identifier = z.string().min(1).max(80);

export const WorkflowAuthorizationSchema = z.strictObject({
  /** Blueprint roles permitted to take this transition. */
  roles: z.array(identifier).min(1),
  /** Capability these roles must hold on the workflow entity. */
  capability: z.string().min(1).max(120),
});

export const WorkflowStateSchema = z.strictObject({
  /** Stable state id; when validated, this must be one of the enum values. */
  id: identifier,
  label: z.string().min(1).max(60).optional(),
});

export const WorkflowTransitionSchema = z.strictObject({
  from: identifier,
  to: identifier,
  label: z.string().min(1).max(60).optional(),
  /** Simple field equality guards only; no predicates or executable expressions. */
  guards: z
    .array(
      z.strictObject({
        field: identifier,
        equals: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
      })
    )
    .default([]),
  authorization: WorkflowAuthorizationSchema.optional(),
});

/** A data-only state machine bound to one enum field on one blueprint entity. */
export const WorkflowDefinitionSchema = z.strictObject({
  entity: identifier,
  field: identifier,
  initialState: identifier,
  states: z.array(WorkflowStateSchema).min(1),
  transitions: z.array(WorkflowTransitionSchema),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowDefinitionInput = z.input<typeof WorkflowDefinitionSchema>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;
export type WorkflowAuthorization = z.infer<typeof WorkflowAuthorizationSchema>;
