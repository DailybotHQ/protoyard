/**
 * `@protoyard/blueprint/kinds` — the runtime of content-kind blueprints (deck,
 * page, doc; ADR-036): `defineKindRuntime` (the prototype definition shared by
 * the player and generated kind prototypes) and `createKindServices` (the
 * persistent `BlockStateHost` and form responses). A subpath so app
 * prototypes and the universal player never load it.
 */

export { defineKindRuntime, kindBrandTheme, kindDefaultThemeId } from './brand-runtime.ts';
export {
  definePrototypeFromDoc,
  definePrototypeFromPage,
  PAGES_DEFAULT_SCENARIO,
  PAGES_GENERATOR_VERSION,
  type PageDocRuntimeOptions,
} from './page-doc-runtime.ts';
export {
  type AnyContentBlueprint,
  defineKindPrototype,
  KIND_CAPABILITIES,
  KIND_DEFAULT_SCENARIO,
  KIND_GENERATOR_VERSION,
  KIND_PERSONAS,
  KIND_ROLES,
  KIND_STORES,
  type KindPrototypeOptions,
  type KindRole,
  type KindRuntimeOptions,
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
