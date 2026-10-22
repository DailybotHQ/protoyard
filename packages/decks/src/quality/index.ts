/**
 * `@protoyard/decks/quality` — deck quality thresholds and static checks as
 * data. `deck lint` and the visual sweep both read `DECK_QUALITY` and
 * `DECK_QUALITY_RULES`, so neither re-declares a rule. Renderers never import
 * this subpath.
 */
export {
  checkDeckStatic,
  type DeckQualityIssue,
  type DeckQualityReport,
  deckJsonPath,
} from './check.ts';
export {
  DECK_QUALITY,
  DECK_QUALITY_RULE_BY_ID,
  DECK_QUALITY_RULES,
  type DeckQualityRule,
  type DeckQualityRuleId,
  type DeckQualitySeverity,
} from './rules.ts';
