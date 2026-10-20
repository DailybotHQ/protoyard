import type { WorkflowDefinition } from './schema.ts';

export type WorkflowTransitionCheck =
  | { allowed: true; transition: WorkflowDefinition['transitions'][number] }
  | {
      allowed: false;
      reason:
        | 'unknown-state'
        | 'transition-not-allowed'
        | 'field-guard-failed'
        | 'role-not-authorized'
        | 'capability-not-held';
    };

export type WorkflowTransitionContext = {
  role?: string;
  capabilities?: readonly string[];
  record?: Readonly<Record<string, unknown>>;
};

/** Pure deterministic check; callers still enforce real service policy before a write. */
export function checkWorkflowTransition(
  workflow: WorkflowDefinition,
  from: string,
  to: string,
  context: WorkflowTransitionContext = {}
): WorkflowTransitionCheck {
  const states = new Set(workflow.states.map((state) => state.id));
  if (!states.has(from) || !states.has(to)) return { allowed: false, reason: 'unknown-state' };
  const transition = workflow.transitions.find(
    (candidate) => candidate.from === from && candidate.to === to
  );
  if (!transition) return { allowed: false, reason: 'transition-not-allowed' };
  if (
    transition.guards.some(
      (guard) =>
        !Object.hasOwn(context.record ?? {}, guard.field) ||
        !Object.is(context.record?.[guard.field], guard.equals)
    )
  ) {
    return { allowed: false, reason: 'field-guard-failed' };
  }
  const authorization = transition.authorization;
  if (authorization) {
    if (context.role === undefined || !authorization.roles.includes(context.role)) {
      return { allowed: false, reason: 'role-not-authorized' };
    }
    const capabilities = context.capabilities ?? [];
    if (
      capabilities.includes(`-${authorization.capability}`) ||
      (!capabilities.includes('*') && !capabilities.includes(authorization.capability))
    ) {
      return { allowed: false, reason: 'capability-not-held' };
    }
  }
  return { allowed: true, transition };
}
