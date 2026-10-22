import { areaForAction, decide, effectiveLevel, notifyAllowed } from './policy.ts';
import type {
  ApprovalTransition,
  AuditAction,
  AuditEntry,
  AutonomyConfig,
  ProposedEffects,
  Suggestion,
  SuggestionCandidate,
  SuggestionTarget,
} from './types.ts';

/**
 * Pure detect → suggest → decide transitions. Every function returns the next
 * suggestion, the audit rows to append and the writes to make
 * (`ProposedEffects`); a service carries them out. The engine never persists
 * rows or runs effects itself.
 */

export interface ApprovalContext {
  now: string;
  scopeId: string;
  /**
   * Build the effect payloads the service would write. Called when the mode
   * is `act` or when a person confirms/approves. Return `{}` when there is
   * nothing to apply; omit `notify` when the path should stay quiet.
   */
  buildEffects: (suggestion: Suggestion, path: 'auto' | 'person') => ProposedEffects;
  /** Optional audit detail strings; defaults are short English summaries. */
  detail?: {
    suggested?: (suggestion: Suggestion) => string;
    informed?: (suggestion: Suggestion) => string;
    applied?: (suggestion: Suggestion, applySummary: string) => string;
    dismissed?: (suggestion: Suggestion) => string;
    retargeted?: (suggestion: Suggestion, target: SuggestionTarget) => string;
  };
}

export type ApprovalErrorCode = 'decided' | 'needs_approval' | 'not_approval' | 'not_allowed';

/** A decision the loop refuses; `code` lets the UI pick its message. */
export class ApprovalError extends Error {
  code: ApprovalErrorCode;
  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

export const suggestionIdFor = (sourceId: string) => `approval_sug_${sourceId}`;

const auditId = (suggestionId: string, action: AuditAction, extra = '') =>
  `approval_audit_${suggestionId}_${action}${extra ? `_${extra}` : ''}`;

const NO_PREPARED = {
  preparedApplySummary: null,
  preparedNotifySummary: null,
} as const;

function defaultDetail(action: AuditAction, suggestion: Suggestion, extra?: string): string {
  switch (action) {
    case 'suggested':
      return `Suggested: ${suggestion.summary}`;
    case 'informed':
      return `Informed: ${suggestion.summary}`;
    case 'confirmed':
    case 'approved':
    case 'auto_handled':
      return extra ? `Applied: ${extra}` : `Applied: ${suggestion.summary}`;
    case 'dismissed':
      return `Dismissed: ${suggestion.summary}`;
    case 'edited':
      return extra ? `Retargeted to ${extra}` : `Edited: ${suggestion.summary}`;
    case 'notified':
      return extra ?? 'Notified';
    default:
      return suggestion.summary;
  }
}

function audit(
  ctx: ApprovalContext,
  suggestion: Suggestion,
  action: AuditAction,
  detail: string,
  actorId: string | null,
  extra = ''
): AuditEntry {
  return {
    id: auditId(suggestion.id, action, extra),
    scopeId: ctx.scopeId,
    at: ctx.now,
    actor: actorId ? 'person' : 'agent',
    actorId,
    action,
    suggestionId: suggestion.id,
    detail,
  };
}

function preparedFor(
  suggestion: Suggestion,
  ctx: ApprovalContext
): Pick<Suggestion, 'preparedApplySummary' | 'preparedNotifySummary'> {
  const effects = ctx.buildEffects(suggestion, 'person');
  return {
    preparedApplySummary: effects.apply?.summary ?? null,
    preparedNotifySummary: effects.notify?.text ?? null,
  };
}

/** Apply the primary change and, when the notifications area allows it, notify. */
function applyWrites(
  suggestion: Suggestion,
  config: AutonomyConfig,
  ctx: ApprovalContext,
  path: 'auto' | 'person'
): { effects: ProposedEffects; notified: AuditEntry | null } {
  const built = ctx.buildEffects(suggestion, path);
  const effects: ProposedEffects = {};
  if (built.apply) effects.apply = built.apply;
  if (built.notify && notifyAllowed(config, path)) {
    effects.notify = built.notify;
    return {
      effects,
      notified: audit(ctx, suggestion, 'notified', built.notify.text, null),
    };
  }
  return { effects, notified: null };
}

/** The agent applies on its own (Level 4): status `auto`, audited, notify only at notifications Level 4. */
function autoHandle(
  suggestion: Suggestion,
  config: AutonomyConfig,
  ctx: ApprovalContext
): ApprovalTransition {
  const next: Suggestion = {
    ...suggestion,
    status: 'auto',
    decidedAt: ctx.now,
    decidedBy: 'agent',
    deciderId: null,
  };
  const { effects, notified } = applyWrites(next, config, ctx, 'auto');
  const applySummary = effects.apply?.summary ?? next.summary;
  const detail =
    ctx.detail?.applied?.(next, applySummary) ?? defaultDetail('auto_handled', next, applySummary);
  const rows = [audit(ctx, next, 'auto_handled', detail, null)];
  if (notified) rows.push(notified);
  return { suggestion: next, audit: rows, effects };
}

function baseFromCandidate(
  candidate: SuggestionCandidate,
  config: AutonomyConfig,
  ctx: ApprovalContext
): Suggestion {
  const area = areaForAction(candidate.action, candidate.area);
  const mode = decide(config, candidate.action, candidate.area);
  return {
    id: suggestionIdFor(candidate.sourceId),
    scopeId: ctx.scopeId,
    kind: candidate.kind,
    action: candidate.action,
    area,
    subjectId: candidate.subjectId,
    sourceId: candidate.sourceId,
    summary: candidate.summary,
    targetId: candidate.targetId ?? null,
    targetKey: candidate.targetKey ?? null,
    targetLabel: candidate.targetLabel ?? null,
    status: 'pending',
    mode,
    levelAtCreation: effectiveLevel(config, area),
    createdAt: ctx.now,
    decidedAt: null,
    decidedBy: null,
    deciderId: null,
    ...NO_PREPARED,
    payload: candidate.payload ?? {},
  };
}

/**
 * A detected candidate read at today's level for its action:
 * Level 1 informs (no waiting card), 2 waits for a confirmation, 3 prepares
 * apply/notify summaries for an approver, 4 applies at once.
 */
export function suggestFromCandidate(
  candidate: SuggestionCandidate,
  config: AutonomyConfig,
  ctx: ApprovalContext
): ApprovalTransition {
  const base = baseFromCandidate(candidate, config, ctx);
  if (base.mode === 'inform') {
    const informed: Suggestion = { ...base, status: 'informed' };
    const detail = ctx.detail?.informed?.(informed) ?? defaultDetail('informed', informed);
    return {
      suggestion: informed,
      audit: [audit(ctx, informed, 'informed', detail, null)],
      effects: {},
    };
  }
  if (base.mode === 'act') return autoHandle(base, config, ctx);
  const suggestion: Suggestion =
    base.mode === 'act_with_approval' ? { ...base, ...preparedFor(base, ctx) } : base;
  const detail = ctx.detail?.suggested?.(suggestion) ?? defaultDetail('suggested', suggestion);
  return {
    suggestion,
    audit: [audit(ctx, suggestion, 'suggested', detail, null)],
    effects: {},
  };
}

/**
 * A new candidate from the same source updates the waiting card instead of
 * adding one, read at today's level. A decided card, or one whose content did
 * not change, is left alone (`null`). A level change alone never re-decides a
 * waiting card.
 */
export function refreshPending(
  current: Suggestion,
  candidate: SuggestionCandidate,
  config: AutonomyConfig,
  ctx: ApprovalContext
): ApprovalTransition | null {
  if (current.status !== 'pending') return null;
  const sameContent =
    current.summary === candidate.summary &&
    current.targetId === (candidate.targetId ?? null) &&
    current.targetKey === (candidate.targetKey ?? null);
  if (sameContent) return null;
  const today = decide(config, candidate.action, candidate.area);
  const mode = today === 'inform' ? current.mode : today;
  const area = areaForAction(candidate.action, candidate.area);
  const next: Suggestion = {
    ...current,
    kind: candidate.kind,
    action: candidate.action,
    area,
    subjectId: candidate.subjectId,
    sourceId: candidate.sourceId,
    summary: candidate.summary,
    targetId: candidate.targetId ?? null,
    targetKey: candidate.targetKey ?? null,
    targetLabel: candidate.targetLabel ?? null,
    mode,
    levelAtCreation: effectiveLevel(config, area),
    payload: candidate.payload ?? current.payload,
    ...NO_PREPARED,
  };
  if (mode === 'act') return autoHandle(next, config, ctx);
  return {
    suggestion: mode === 'act_with_approval' ? { ...next, ...preparedFor(next, ctx) } : next,
    audit: [],
    effects: {},
  };
}

export interface ApprovalActor {
  id: string;
  /** Approvers may decide any card and are the only ones who approve. */
  canApprove: boolean;
}

/** The subject confirms, edits or dismisses it; an approver may too; only an approver approves. */
export function mayDecide(
  actor: ApprovalActor,
  suggestion: Pick<Suggestion, 'subjectId'>,
  action: 'confirm' | 'approve' | 'dismiss' | 'edit'
): boolean {
  if (actor.canApprove) return true;
  if (action === 'approve') return false;
  return actor.id === suggestion.subjectId;
}

function requirePending(suggestion: Suggestion) {
  if (suggestion.status !== 'pending') {
    throw new ApprovalError('decided', 'That suggestion was already decided.');
  }
}

/**
 * Confirm (Level 2), approve (Level 3) or dismiss a waiting card. Confirm and
 * approve apply the change and notify (dropped only at notifications Level 1);
 * dismiss writes an audit row and nothing else. Each one answers only for its
 * own mode, and a decided card is refused.
 */
export function decideSuggestion(
  suggestion: Suggestion,
  decision: 'confirm' | 'approve' | 'dismiss',
  actor: ApprovalActor,
  config: AutonomyConfig,
  ctx: ApprovalContext
): ApprovalTransition {
  if (!mayDecide(actor, suggestion, decision)) {
    throw new ApprovalError(
      'not_allowed',
      decision === 'approve'
        ? 'Only an approver may approve.'
        : 'Only the subject, or an approver, may decide.'
    );
  }
  requirePending(suggestion);
  if (decision === 'dismiss') {
    const next: Suggestion = {
      ...suggestion,
      status: 'dismissed',
      decidedAt: ctx.now,
      decidedBy: 'person',
      deciderId: actor.id,
    };
    const detail = ctx.detail?.dismissed?.(next) ?? defaultDetail('dismissed', next);
    return {
      suggestion: next,
      audit: [audit(ctx, next, 'dismissed', detail, actor.id)],
      effects: {},
    };
  }
  const needsApproval = suggestion.mode === 'act_with_approval';
  if (needsApproval && decision === 'confirm') {
    throw new ApprovalError('needs_approval', 'This suggestion needs an approval.');
  }
  if (!needsApproval && decision === 'approve') {
    throw new ApprovalError('not_approval', 'This suggestion is confirmed, not approved.');
  }
  const next: Suggestion = {
    ...suggestion,
    status: 'confirmed',
    decidedAt: ctx.now,
    decidedBy: 'person',
    deciderId: actor.id,
  };
  const { effects, notified } = applyWrites(next, config, ctx, 'person');
  const applySummary = effects.apply?.summary ?? next.summary;
  const action = decision === 'approve' ? 'approved' : 'confirmed';
  const detail =
    ctx.detail?.applied?.(next, applySummary) ?? defaultDetail(action, next, applySummary);
  const rows = [audit(ctx, next, action, detail, actor.id)];
  if (notified) rows.push(notified);
  return { suggestion: next, audit: rows, effects };
}

/** Retarget a waiting card; prepared summaries follow it when present. */
export function retarget(
  suggestion: Suggestion,
  target: SuggestionTarget,
  actor: ApprovalActor,
  ctx: ApprovalContext
): ApprovalTransition {
  if (!mayDecide(actor, suggestion, 'edit')) {
    throw new ApprovalError('not_allowed', 'Only the subject, or an approver, may decide.');
  }
  requirePending(suggestion);
  if (target.targetId === suggestion.targetId) {
    return { suggestion, audit: [], effects: {} };
  }
  const moved: Suggestion = {
    ...suggestion,
    targetId: target.targetId,
    targetKey: target.targetKey,
    targetLabel: target.targetLabel,
  };
  const next = moved.preparedApplySummary ? { ...moved, ...preparedFor(moved, ctx) } : moved;
  const detail =
    ctx.detail?.retargeted?.(next, target) ?? defaultDetail('edited', next, target.targetKey);
  return {
    suggestion: next,
    audit: [audit(ctx, next, 'edited', detail, actor.id, target.targetKey)],
    effects: {},
  };
}

/**
 * What a surface says about a suggestion while it waits or after it is
 * decided. Pure copy helper; prototypes may replace it.
 */
export function statusLine(
  suggestion: Suggestion,
  viewer: Pick<ApprovalActor, 'canApprove'>,
  notified: boolean
): string {
  if (suggestion.status === 'auto') {
    return notified
      ? `Agent handled: ${suggestion.summary} and sent a notification`
      : `Agent handled: ${suggestion.summary}`;
  }
  if (suggestion.status === 'confirmed') {
    return suggestion.targetLabel
      ? `${suggestion.targetLabel} · ${suggestion.summary}`
      : suggestion.summary;
  }
  if (suggestion.status === 'informed') {
    return `Informed: ${suggestion.summary}`;
  }
  if (suggestion.status === 'pending' && suggestion.mode === 'act_with_approval') {
    return viewer.canApprove
      ? `Needs your approval: ${suggestion.summary}`
      : 'Waiting for an approver';
  }
  if (suggestion.status === 'dismissed') {
    return `Dismissed: ${suggestion.summary}`;
  }
  return suggestion.summary;
}

/** Newest first, ties by id, so the audit never depends on insertion order. */
export function sortAudit(entries: readonly AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
