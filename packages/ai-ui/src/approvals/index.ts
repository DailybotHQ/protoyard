/**
 * Suggestion approval UI for `@protoyard/ai` approval loop. Lazy subpath
 * `@protoyard/ai-ui/approvals`. Callbacks only — prototypes own services.
 */
export { default as AuditTrail } from './AuditTrail.svelte';
export { default as AutonomyLevelPicker } from './AutonomyLevelPicker.svelte';
export { default as ChatApprovalCard } from './ChatApprovalCard.svelte';
export {
  AUDIT_ACTION_LABELS,
  AUTONOMY_AREA_LABELS,
  AUTONOMY_LEVEL_LABELS,
  AUTONOMY_LEVELS,
  areaLabel,
  modeNeedsApproval,
  SUGGESTION_STATUS_LABELS,
} from './labels.ts';
export { default as SuggestionCard } from './SuggestionCard.svelte';
