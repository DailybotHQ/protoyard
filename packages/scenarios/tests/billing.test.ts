import {
  MS_PER_DAY,
  OrganizationSchema,
  parseScenario,
  type Scenario,
  type SubscriptionStatus,
} from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  billingFields,
  createGenerateContext,
  GENERATOR_SDK_VERSION,
  generateTeam,
  LAPSED_DAYS_AGO,
  TRIAL_DAYS_LEFT,
  validateWorld,
} from '../src/index.ts';

const REF = '2026-06-01T09:00:00.000Z';
const NOW = Date.parse(REF);
const scenario = (subscription: SubscriptionStatus, ageDays = 45, size = 12): Scenario =>
  parseScenario({
    id: 'billing',
    name: 'Billing',
    seed: 42,
    referenceTime: REF,
    organization: { ageDays, size, subscription },
  });
const iso = (ms: number) => new Date(ms).toISOString();

describe('organization billing fields', () => {
  it('fills trial, seats, interval and period end from the subscription and ctx.time', () => {
    const team = (s: SubscriptionStatus, ageDays?: number, size?: number) =>
      generateTeam(createGenerateContext(scenario(s, ageDays, size))).organization;

    expect(team('free')).toMatchObject({
      billingStatus: 'none',
      trialEndsAt: null,
      seats: 12,
      billingInterval: null,
      currentPeriodEnd: null,
    });
    expect(team('trial')).toMatchObject({
      billingStatus: 'trialing',
      trialEndsAt: iso(NOW + TRIAL_DAYS_LEFT * MS_PER_DAY),
      seats: 12,
      billingInterval: 'month',
      currentPeriodEnd: iso(NOW + TRIAL_DAYS_LEFT * MS_PER_DAY),
    });
    // 45 days old with 30-day periods: the second period ends 60 days after creation.
    const created = NOW - 45 * MS_PER_DAY;
    expect(team('pro')).toMatchObject({
      billingStatus: 'active',
      trialEndsAt: null,
      seats: 12,
      billingInterval: 'month',
      currentPeriodEnd: iso(created + 60 * MS_PER_DAY),
    });
    expect(team('enterprise', 400, 250)).toMatchObject({
      billingInterval: 'year',
      seats: 250,
      currentPeriodEnd: iso(NOW - 400 * MS_PER_DAY + 730 * MS_PER_DAY),
    });
    expect(team('enterprise', 30, 3).seats).toBe(10);
    expect(team('expired')).toMatchObject({
      billingStatus: 'expired',
      trialEndsAt: null,
      billingInterval: 'month',
      currentPeriodEnd: iso(NOW - LAPSED_DAYS_AGO * MS_PER_DAY),
    });
  });

  it('is deterministic, consumes no randomness and keeps the world valid', () => {
    const s = scenario('trial');
    const team = generateTeam(createGenerateContext(s));
    expect(generateTeam(createGenerateContext(s))).toEqual(team);
    // Same people as a world built without billing fields: no rng/faker draw was added.
    const { trialEndsAt, seats, billingInterval, currentPeriodEnd, ...rest } = team.organization;
    expect(rest).toMatchObject({ id: s.organization.id, plan: 'pro' });
    expect(billingFields('trial', 12, Date.parse(team.organization.createdAt), NOW)).toEqual({
      trialEndsAt,
      seats,
      billingInterval,
      currentPeriodEnd,
    });
    expect(validateWorld({ ...team, tables: {} }, { referenceTime: REF })).toEqual([]);
    expect(GENERATOR_SDK_VERSION).toBe(2);
  });

  it('parses organizations stored before the fields existed, with defaults', () => {
    const old = {
      id: 'org_1',
      name: 'Old Example Co',
      plan: 'pro',
      billingStatus: 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
      size: 4,
    };
    expect(OrganizationSchema.parse(old)).toMatchObject({
      trialEndsAt: null,
      seats: 1,
      billingInterval: null,
      currentPeriodEnd: null,
    });
    expect(OrganizationSchema.safeParse({ ...old, billingInterval: 'week' }).success).toBe(false);
    expect(OrganizationSchema.safeParse({ ...old, seats: -1 }).success).toBe(false);
  });
});
