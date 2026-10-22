/**
 * Generic suggestion and approval loop model for simulated agents.
 *
 * Pure data: no Svelte, no database, no network. A service carries out the
 * `ProposedEffects` a transition returns. Autonomy levels and outbound
 * actions stay visibly approval-gated in the simulated product model.
 *
 * Complements per-tool `requiresApproval` on `createAiAgentRunner`: tools gate
 * a single call; this loop gates multi-step detect → suggest → decide flows
 * with area levels, caps and an audit trail.
 */

/** Default areas a prototype may configure. Custom area ids are allowed too. */
export const AUTONOMY_AREAS = ['records', 'notifications', 'workspace', 'external'] as const;
export type AutonomyArea = (typeof AUTONOMY_AREAS)[number] | (string & {});

/** 1 inform · 2 suggest · 3 act with approval · 4 act within limits. */
export type AutonomyLevel = 1 | 2 | 3 | 4;
export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = [1, 2, 3, 4];

/** What `decide` returns after the area lookup and the cap clamp. */
export type PolicyMode = 'inform' | 'suggest' | 'act_with_approval' | 'act';

export interface AutonomyConfig {
  levels: Record<string, AutonomyLevel>;
  caps: Partial<Record<string, AutonomyLevel>>;
}

/**
 * `informed` is Level 1: the agent only tells the team (no waiting card).
 * Decided statuses keep one table for Home and the audit.
 */
export const SUGGESTION_STATUSES = [
  'pending',
  'confirmed',
  'dismissed',
  'auto',
  'informed',
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface Suggestion {
  /** Stable id, usually derived from the source that produced the candidate. */
  id: string;
  /** Prototype / workspace scope (fictional org, project, etc.). */
  scopeId: string;
  /** Product-defined kind (for example `link_record` or `schedule_reminder`). */
  kind: string;
  /** Policy action used to look up the autonomy area. */
  action: string;
  /** Autonomy area the suggestion was classified under. */
  area: string;
  /** The person the suggestion is about. */
  subjectId: string;
  /** The source event or answer that produced the candidate. */
  sourceId: string;
  /** Plain-text summary shown on the card. */
  summary: string;
  /** Optional target the suggestion would act on. */
  targetId: string | null;
  targetKey: string | null;
  targetLabel: string | null;
  status: SuggestionStatus;
  /** How it was classified when it was created. */
  mode: PolicyMode;
  levelAtCreation: AutonomyLevel;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: 'person' | 'agent' | null;
  /** The deciding person; null when the agent decided on its own. */
  deciderId: string | null;
  /** Summaries an act-with-approval card quotes before Approve. */
  preparedApplySummary: string | null;
  preparedNotifySummary: string | null;
  /** Opaque payload the service uses when carrying out effects. */
  payload: Readonly<Record<string, unknown>>;
}

export const AUDIT_ACTIONS = [
  'suggested',
  'confirmed',
  'approved',
  'dismissed',
  'edited',
  'auto_handled',
  'notified',
  'informed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  scopeId: string;
  at: string;
  actor: 'agent' | 'person';
  /** The person who acted; null for the agent's own rows. */
  actorId: string | null;
  action: AuditAction;
  suggestionId: string;
  detail: string;
}

/**
 * What a decision asks the service to write. The model never touches the
 * database: a service (or a timeline event) carries these out.
 */
export interface ProposedEffects {
  /** Apply a domain change (link, update, schedule, …). */
  apply?: {
    type: string;
    targetId: string;
    summary: string;
    payload: Readonly<Record<string, unknown>>;
  };
  /** Optional side notification when the notifications area allows it. */
  notify?: {
    channelId: string;
    text: string;
    mentionId?: string;
  };
}

/** One decision: the suggestion as it is now, audit rows to append, writes to make. */
export interface ApprovalTransition {
  suggestion: Suggestion;
  audit: AuditEntry[];
  effects: ProposedEffects;
}

/** A detector output before it becomes a suggestion. */
export interface SuggestionCandidate {
  sourceId: string;
  subjectId: string;
  kind: string;
  /** Policy action used with `AREA_OF_ACTION` (or pass `area` directly). */
  action: string;
  /** Override the default area for `action` when set. */
  area?: string;
  summary: string;
  targetId?: string;
  targetKey?: string;
  targetLabel?: string;
  payload?: Readonly<Record<string, unknown>>;
}

/** A different target the person can pick while the card is waiting (Edit). */
export interface SuggestionTarget {
  targetId: string;
  targetKey: string;
  targetLabel: string;
}
