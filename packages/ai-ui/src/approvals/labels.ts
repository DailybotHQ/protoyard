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

/**
 * A message lookup: `useMessages()` from `texuli/i18n` fits. The constants
 * above are the English defaults; these helpers resolve them through the
 * prototype's dictionary (`protoyard.ai.autonomy.*`, `protoyard.ai.audit.*`,
 * `protoyard.ai.suggestion.status.*`).
 */
export type AiMessages = (
  id: string,
  english: string,
  values?: Readonly<Record<string, string>>
) => string;

const english: AiMessages = (_id, text) => text;
const kebab = (key: string) => key.replace(/_/g, '-');

/** Name and definition of an autonomy level through the dictionary. */
export function autonomyLevelLabel(
  level: AutonomyLevel,
  messages: AiMessages = english
): { name: string; definition: string } {
  const meta = AUTONOMY_LEVEL_LABELS[level];
  return {
    name: messages(`protoyard.ai.autonomy.level-${level}.name`, meta.name),
    definition: messages(`protoyard.ai.autonomy.level-${level}.definition`, meta.definition),
  };
}

/** An audit action's label through the dictionary. */
export function auditActionLabel(action: AuditAction, messages: AiMessages = english): string {
  return messages(`protoyard.ai.audit.${kebab(action)}`, AUDIT_ACTION_LABELS[action]);
}

/** A suggestion status label through the dictionary. */
export function suggestionStatusLabel(
  status: SuggestionStatus,
  messages: AiMessages = english
): string {
  return messages(`protoyard.ai.suggestion.status.${status}`, SUGGESTION_STATUS_LABELS[status]);
}

export function modeNeedsApproval(mode: PolicyMode): boolean {
  return mode === 'act_with_approval';
}

/** A known area's label (through the dictionary when `messages` is given); unknown areas pass through. */
export function areaLabel(area: string, messages: AiMessages = english): string {
  if ((AUTONOMY_AREAS as readonly string[]).includes(area)) {
    return messages(
      `protoyard.ai.autonomy.area.${area}`,
      AUTONOMY_AREA_LABELS[area as (typeof AUTONOMY_AREAS)[number]]
    );
  }
  return area;
}

export { AUTONOMY_LEVELS };
