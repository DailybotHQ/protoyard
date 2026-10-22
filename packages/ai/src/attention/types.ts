/**
 * Attention items raised by deterministic watchers.
 *
 * Pure data types. Persistence, policy and UI live in the consuming prototype.
 * Watcher output is simulated decision support and is never real authorization.
 */

/** How the assistant is expected to present the item. */
export type AttentionResponse = 'asks_first' | 'handles' | 'brings_person';

export type AttentionKind = 'reassign' | 'move_date' | 'nudge' | 'escalate' | 'summary';

export type AttentionStatus = 'open' | 'approved' | 'dismissed' | 'snoozed';

export type AttentionAction =
  | { type: 'reassign_task'; taskKey: string; toPersonaId: string }
  | { type: 'move_date'; milestoneId: string; toDate: string }
  | { type: 'nudge'; personaId: string; checkinId: string }
  | {
      type: 'ask_person';
      personaId: string;
      /** Asked instead when `personaId` is the person deciding. */
      fallbackPersonaId: string;
      question: string;
    }
  | { type: 'post_summary'; channel: string };

/** Copy as an i18n key and its parameters. English fallbacks live on the item. */
export interface TextRef {
  key: string;
  params?: Record<string, string | number>;
  /** Parameter names that hold ISO dates, formatted for the reader. */
  dates?: string[];
}

/** Where an evidence chip leads: a hash path, a chat channel, or structured data. */
export type EvidenceTarget =
  | { kind: 'path'; path: string }
  | { kind: 'channel'; channel: string }
  | { kind: 'mood'; scores: { period: string; score: number }[] }
  | {
      kind: 'tasks';
      total: number;
      tasks: { key: string; title: string; due: string | null }[];
    };

export interface EvidenceLink {
  label: string;
  href: string;
  text?: TextRef;
  target?: EvidenceTarget;
}

export interface AttentionItem {
  id: string;
  key: string;
  kind: AttentionKind;
  response: AttentionResponse;
  status: AttentionStatus;
  title: string;
  detail: string;
  text?: { title: TextRef; detail: TextRef };
  evidence: EvidenceLink[];
  action: AttentionAction;
  raisedAt: string;
  snoozedUntil: string | null;
  /** The person the row is about; a stable team id for team-level escalations. */
  subjectId: string;
}

export interface AttentionAuditEntry {
  id: string;
  itemId: string;
  decision: 'approved' | 'dismissed' | 'snoozed';
  by: string;
  at: string;
  effect: string;
  effectText?: TextRef;
}
