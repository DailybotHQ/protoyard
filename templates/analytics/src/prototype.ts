import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database, type LiveCounterRow } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import {
  ANALYTICS_TEMPLATE_GENERATOR_VERSION,
  analyticsTimeline,
  generateAnalyticsWorld,
} from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to this prototype's schema, policy, scenarios,
 * generator and timeline. Read this file first: schema → policy → scenarios →
 * generator → services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateAnalyticsWorld,
  generatorVersion: ANALYTICS_TEMPLATE_GENERATOR_VERSION,
  timeline: analyticsTimeline,
  // Timeline events move the live counter (DevTools → advance time).
  applyEvent: async (event, ctx) => {
    if (event.type !== 'analytics.counter') return;
    const payload = event.payload as { counter: string; delta: number };
    const row = (await ctx.get('counters', payload.counter)) as LiveCounterRow | undefined;
    await ctx.put('counters', {
      id: payload.counter,
      value: (row?.value ?? 0) + payload.delta,
      updatedAt: event.at,
    });
  },
  integrity: {
    relations: {
      events: { userId: 'users' },
      dashboards: { ownerId: 'py_personas' },
      segments: { ownerId: 'py_personas' },
      activity: { actorId: 'py_personas' },
    },
    timestamps: {
      users: ['createdAt'],
      events: ['at'],
      dashboards: ['createdAt', 'updatedAt'],
      segments: ['createdAt', 'updatedAt'],
    },
  },
});
