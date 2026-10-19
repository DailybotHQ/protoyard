import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import {
  type AlertCheck,
  database,
  type LiveCounterRow,
  type MetricAlert,
} from './database/schema.ts';
import { policy } from './domain/policy.ts';
import {
  type AlertCheckPayload,
  generatePebblestatWorld,
  PEBBLESTAT_GENERATOR_VERSION,
  pebblestatTimeline,
} from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to Pebblestat's schema, policy, scenarios, generator
 * and timeline. Read this file first: schema → policy → scenarios →
 * generator → services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generatePebblestatWorld,
  generatorVersion: PEBBLESTAT_GENERATOR_VERSION,
  timeline: pebblestatTimeline,
  // Timeline events move the live counter and run the daily alert checks (DevTools → advance time).
  applyEvent: async (event, ctx) => {
    if (event.type === 'analytics.counter') {
      const payload = event.payload as { counter: string; delta: number };
      const row = (await ctx.get('counters', payload.counter)) as LiveCounterRow | undefined;
      await ctx.put('counters', {
        id: payload.counter,
        value: (row?.value ?? 0) + payload.delta,
        updatedAt: event.at,
      });
      return;
    }
    if (event.type !== 'alert.check') return;
    const { alertId, value } = event.payload as AlertCheckPayload;
    const alert = (await ctx.get('alerts', alertId)) as MetricAlert | undefined;
    // Deleted since the timeline was built, or created after this check's day.
    if (!alert || alert.createdAt > event.at) return;
    const crossed = alert.operator === 'below' ? value < alert.threshold : value > alert.threshold;
    // Muted alerts are still checked (the history stays complete) but never fire.
    const fired = crossed && !alert.muted;
    const check: AlertCheck = {
      id: event.id,
      alertId,
      projectId: alert.projectId,
      at: event.at,
      value,
      fired,
    };
    await ctx.put('alertChecks', check);
    await ctx.put('alerts', {
      ...alert,
      status: fired ? 'firing' : 'ok',
      lastValue: value,
      lastCheckedAt: event.at,
      lastFiredAt: fired ? event.at : alert.lastFiredAt,
    });
  },
  integrity: {
    relations: {
      users: { projectId: 'projects' },
      events: { userId: 'users', projectId: 'projects' },
      rollups: { projectId: 'projects' },
      dashboards: { projectId: 'projects', ownerId: 'py_personas' },
      segments: { projectId: 'projects', ownerId: 'py_personas' },
      reports: { projectId: 'projects', ownerId: 'py_personas' },
      alerts: { projectId: 'projects', ownerId: 'py_personas' },
      alertChecks: { alertId: 'alerts', projectId: 'projects' },
      annotations: { projectId: 'projects', authorId: 'py_personas' },
      activity: { actorId: 'py_personas' },
    },
    timestamps: {
      users: ['createdAt'],
      events: ['at'],
      dashboards: ['createdAt', 'updatedAt'],
      segments: ['createdAt', 'updatedAt'],
      reports: ['createdAt', 'updatedAt'],
      alerts: ['createdAt', 'updatedAt'],
      alertChecks: ['at'],
      annotations: ['at'],
    },
  },
});
