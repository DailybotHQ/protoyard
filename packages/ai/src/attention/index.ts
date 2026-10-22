/**
 * Deterministic attention watchers for Protoyard prototypes.
 *
 * Pure data: seeded world facts + simulated time → stable attention items.
 * Import from `@protoyard/ai/attention` so the base AI engine stays lean.
 */

export {
  type AttentionAccess,
  attentionAccessOf,
  attentionVisibleTo,
  canDecideAttention,
  canSeeAttentionQueue,
} from './access.ts';
export { askTarget } from './ask-target.ts';
export {
  ATTENTION_TZ_OFFSET_HOURS,
  ageDays,
  dayKey,
  localStamp,
  plusDays,
  previousWorkingDays,
  withinDays,
} from './clock.ts';
export {
  ATTENTION_FIXTURE_TIMEZONE,
  attentionFixtureWorld,
} from './fixture.ts';
export {
  ATTENTION_PRESETS,
  type AttentionPreset,
  type AttentionPresetId,
  attentionPreset,
  attentionWatchersForPreset,
} from './presets.ts';
export type {
  AttentionAction,
  AttentionAuditEntry,
  AttentionItem,
  AttentionKind,
  AttentionResponse,
  AttentionStatus,
  EvidenceLink,
  EvidenceTarget,
  TextRef,
} from './types.ts';
export {
  ATTENTION_WATCHERS,
  type AttentionWatcherName,
  attentionKey,
  OVERLOAD_THRESHOLD,
  type RunWatchersOptions,
  runWatchers,
  STALL_DAYS,
  WORKING_DAY_THRESHOLD,
  watchMorale,
  watchOverloaded,
  watchQuietPerson,
  watchSlippingDate,
  watchStalled,
  watchSummaryDue,
} from './watchers.ts';
export type {
  WatchComment,
  WatcherWorld,
  WatchMilestone,
  WatchMood,
  WatchPerson,
  WatchResponse,
  WatchSummaryFact,
  WatchTask,
} from './world.ts';
