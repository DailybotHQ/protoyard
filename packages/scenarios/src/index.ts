export {
  composeScenario,
  type DeepPartial,
  deepMerge,
  parseScenarioStrict,
  resolveScenarios,
  ScenarioDefinitionError,
  type ScenarioFragment,
} from './compose.ts';
export {
  buildGenerateContext,
  createGenerateContextAsync,
  DENSITY_FACTORS,
  type FakerModule,
  GENERATOR_SDK_VERSION,
  loadFaker,
  scaleForDensity,
  seededFaker,
} from './context.ts';
export { createGenerateContext, createSeededFaker } from './context-sync.ts';
export {
  AVATAR_COLORS,
  billingFields,
  EXAMPLE_EMAIL_DOMAINS,
  type GenerateTeamOptions,
  generateTeam,
  LAPSED_DAYS_AGO,
  type Team,
  TRIAL_DAYS_LEFT,
} from './identity.ts';
export {
  type IntegrityViolation,
  validateWorld,
  type WorldIntegrity,
  WorldIntegrityError,
} from './integrity.ts';
export {
  fragments,
  PRESET_IDS,
  PRESET_REFERENCE_TIME,
  PRESET_SEED,
  PRESETS,
  type PresetId,
  presetScenario,
} from './presets.ts';
export { type DailyEventsOptions, type DaySlot, dailyEvents, dayRng } from './timeline.ts';
