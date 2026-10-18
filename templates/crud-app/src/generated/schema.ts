/**
 * GENERATED — hash: crud-app-schema-v1
 * Dexie store strings derived from the blueprint.
 */
import { deriveStores } from '@protoyard/blueprint';
import type { DatabaseDefinition } from '@protoyard/core';
import { blueprint } from './blueprint.ts';

export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: deriveStores(blueprint) }],
};
