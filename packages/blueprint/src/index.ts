/**
 * `@protoyard/blueprint` — data-only blueprints (ADR-017). A `blueprint.json`
 * describes a product (entities, fields, relations, roles, screens) without
 * any executable code; this package validates it and derives what a
 * prototype needs from it.
 *
 * Framework-agnostic: it depends only on `@protoyard/core` and zod and never
 * imports Svelte (ADR-002). The schema and derivations land in later tasks.
 */

/** Version of the blueprint document format. Bumped only on breaking changes. */
export const BLUEPRINT_FORMAT_VERSION = 1;
