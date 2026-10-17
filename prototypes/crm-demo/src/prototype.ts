import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { applyCrmEvent, crmTimeline, generateCrmWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires the static manifest (protoyard.json) to this prototype's own domain.
 * Read this file first to understand the app: schema → policy → scenarios →
 * generator → timeline.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateCrmWorld,
  timeline: crmTimeline,
  applyEvent: applyCrmEvent,
});
