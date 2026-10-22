/**
 * `@protoyard/blueprint/kinds` — the runtime of content-kind blueprints (deck,
 * page, doc; ADR-036): `defineKindRuntime` (the prototype definition shared by
 * the player and generated kind prototypes) and `createKindServices` (the
 * persistent `BlockStateHost` and form responses). A subpath so app
 * prototypes and the universal player never load it.
 */
export {
  type AnyContentBlueprint,
  defineKindRuntime,
  KIND_CAPABILITIES,
  KIND_DEFAULT_SCENARIO,
  KIND_GENERATOR_VERSION,
  KIND_PERSONAS,
  KIND_ROLES,
  KIND_STORES,
  type KindRole,
  type KindRuntimeOptions,
  kindDefaultThemeId,
  kindPolicy,
  kindScenarios,
  kindWorld,
} from './runtime.ts';
export {
  createKindServices,
  type FormResponse,
  FormResponseError,
  findDocumentBlock,
  formResponseSchema,
  type KindServices,
  type KindServicesOptions,
} from './services.ts';
