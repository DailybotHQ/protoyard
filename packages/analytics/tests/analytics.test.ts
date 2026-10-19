import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RetentionIntervalSchema, RetentionPeriodsSchema } from '../src/cohort.ts';
import { FunnelDefinitionSchema } from '../src/funnel.ts';
import { ANALYTICS_GENERATOR_VERSION } from '../src/generators/index.ts';
import { AnalyticsEventSchema, GranularitySchema } from '../src/index.ts';

const root = join(import.meta.dirname, '..');

describe('@protoyard/analytics contracts', () => {
  it('parses a valid event and defaults its properties', () => {
    const event = AnalyticsEventSchema.parse({
      id: 'evt_0001',
      type: 'checkout_completed',
      userId: 'usr_0001',
      at: '2026-03-02T09:00:00.000Z',
    });
    expect(event.properties).toEqual({});
  });

  it('rejects bad event names, instants and nested property values', () => {
    const base = { id: 'e', userId: 'u', at: '2026-03-02T09:00:00.000Z', type: 'signup' };
    expect(AnalyticsEventSchema.safeParse({ ...base, type: 'Sign Up' }).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ ...base, at: '2026-03-02' }).success).toBe(false);
    expect(
      AnalyticsEventSchema.safeParse({ ...base, properties: { plan: { tier: 1 } } }).success
    ).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('validates granularity, funnels and retention settings', () => {
    expect(GranularitySchema.options).toEqual(['hour', 'day', 'week', 'month']);
    const step = (id: string) => ({ id, label: id, eventType: id });
    expect(FunnelDefinitionSchema.safeParse([step('a'), step('b')]).success).toBe(true);
    expect(FunnelDefinitionSchema.safeParse([step('a')]).success).toBe(false);
    expect(FunnelDefinitionSchema.safeParse([step('a'), step('a')]).success).toBe(false);
    expect(RetentionIntervalSchema.safeParse('week').success).toBe(true);
    expect(RetentionPeriodsSchema.safeParse(0).success).toBe(false);
    expect(ANALYTICS_GENERATOR_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('every export target exists', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(Object.keys(pkg.exports)).toEqual(['.', './generators', './funnel', './cohort']);
    for (const target of Object.values(pkg.exports))
      expect(existsSync(join(root, target))).toBe(true);
  });
});
