/**
 * `@protoyard/views/activity` — comments and activity without a framework:
 * mention tokens stored as ids and resolved to names when shown, day groups
 * relative to the runtime clock, plain-text change summaries, an adapter from
 * blueprint audit rows, threads and reactions.
 */
export { type DayGroup, type DayGroupOptions, dayLabel, groupByDay, whenLabel } from './days.ts';
export {
  type ActivitySegment,
  decodeMentions,
  encodeMentions,
  type MentionCandidate,
  type MentionLookups,
  mentionedIds,
  plainText,
  tokenize,
} from './mentions.ts';
export {
  ACTIVITY_KINDS,
  type ActivityFilter,
  type ActivityItem,
  type ActivityKind,
  type AuditRowLike,
  auditToActivity,
  describeChange,
  type FieldChange,
  filterActivity,
  REDACTED,
  type SummaryOptions,
  sortActivity,
  summarizeChanges,
  valueText,
} from './summary.ts';
export {
  type ActivityComment,
  buildThreads,
  type CommentInput,
  CommentInputSchema,
  type CommentThreadNode,
  toggleReaction,
} from './threads.ts';
