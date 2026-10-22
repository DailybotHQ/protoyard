import {
  AUTONOMY_AREAS,
  AUTONOMY_LEVELS,
  type AuditAction,
  type AutonomyLevel,
  type PolicyMode,
  type SuggestionStatus,
} from '@protoyard/ai';

/** Human labels for the four autonomy levels (simulated product model). */
export const AUTONOMY_LEVEL_LABELS: Record<AutonomyLevel, { name: string; definition: string }> = {
  1: {
    name: 'Inform',
    definition: 'The agent only tells the team. No waiting card.',
  },
  2: {
    name: 'Suggest',
    definition: 'The agent proposes a change and waits for a person to confirm.',
  },
  3: {
    name: 'Act with approval',
    definition: 'The agent prepares the change; an approver must approve first.',
  },
  4: {
    name: 'Act within limits',
    definition: 'The agent may apply the change on its own (still simulated).',
  },
};

export const AUTONOMY_AREA_LABELS: Record<(typeof AUTONOMY_AREAS)[number], string> = {
  records: 'Records',
  notifications: 'Notifications',
  workspace: 'Workspace',
  external: 'External messaging',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  suggested: 'Suggested',
  confirmed: 'Confirmed',
  approved: 'Approved',
  dismissed: 'Dismissed',
  edited: 'Edited',
  auto_handled: 'Handled automatically',
  notified: 'Notified',
  informed: 'Informed',
};

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: 'Waiting',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
  auto: 'Handled automatically',
  informed: 'Informed',
};

export function modeNeedsApproval(mode: PolicyMode): boolean {
  return mode === 'act_with_approval';
}

export function areaLabel(area: string): string {
  if ((AUTONOMY_AREAS as readonly string[]).includes(area)) {
    return AUTONOMY_AREA_LABELS[area as (typeof AUTONOMY_AREAS)[number]];
  }
  return area;
}

export { AUTONOMY_LEVELS };
