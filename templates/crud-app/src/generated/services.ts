/**
 * GENERATED — hash: crud-app-services-v1
 * Entity services factory bound to this template's blueprint.
 */
import { createEntityServices, type EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { blueprint } from './blueprint.ts';

export function createServices(runtime: PrototypeRuntime): EntityServices {
  return createEntityServices(runtime, blueprint);
}
