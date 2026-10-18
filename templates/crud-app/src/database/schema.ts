/**
 * Folder-contract database module. The Dexie stores are derived from
 * blueprint.json (see `src/generated/schema.ts`). Keep the highest
 * `version: 1` in sync with protoyard.json storage.schemaVersion.
 */
export { database } from '../generated/schema.ts';
