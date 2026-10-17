import { createIdFactory, MS_PER_DAY, parseScenario, type Scenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  composeScenario,
  createGenerateContext,
  dailyEvents,
  deepMerge,
  fragments,
  generateTeam,
  PRESET_IDS,
  PRESETS,
  presetScenario,
  resolveScenarios,
  scaleForDensity,
  validateWorld,
} from '../src/index.ts';

const REF = '2026-06-01T09:00:00.000Z';
const scenario = (overrides: Record<string, unknown> = {}): Scenario =>
  parseScenario({ id: 'demo', name: 'Demo', seed: 42, referenceTime: REF, ...overrides });

describe('generate context', () => {
  it('is deterministic and never uses the global faker', () => {
    const run = () => {
      const ctx = createGenerateContext(scenario());
      return [
        ctx.rng.int(0, 1e6),
        ctx.faker.person.fullName(),
        ctx.faker.date.recent().toISOString(),
        ctx.ids.next('x'),
      ];
    };
    expect(run()).toEqual(run());
    const other = createGenerateContext(scenario({ seed: 43 }));
    expect(other.faker.person.fullName()).not.toBe(
      createGenerateContext(scenario()).faker.person.fullName()
    );
    // faker's reference date is the scenario time, not the machine clock.
    const recent = createGenerateContext(scenario()).faker.date.recent();
    expect(recent.getTime()).toBeLessThanOrEqual(Date.parse(REF));
  });

  it('scales by density', () => {
    expect([0, 0.25, 1, 4, 25].map((f) => f)).toHaveLength(5);
    expect(scaleForDensity('empty', 10)).toBe(0);
    expect(scaleForDensity('sparse', 2)).toBe(1);
    expect(scaleForDensity('normal', 10)).toBe(10);
    expect(scaleForDensity('dense', 10)).toBe(40);
    expect(scaleForDensity('massive', 10)).toBe(250);
    expect(scaleForDensity('massive', 0)).toBe(0);
  });
});

describe('presets and composition', () => {
  it('every preset validates on its own', () => {
    for (const id of PRESET_IDS) expect(presetScenario(id).id).toBe(id);
    expect(presetScenario('six-month-new-member')).toMatchObject({
      organization: { ageDays: 180 },
      actor: { joinedDaysAgo: 0 },
    });
    expect(presetScenario('large-organization')).toMatchObject({
      density: 'massive',
      organization: { size: 250 },
    });
    expect(presetScenario('onboarding-in-progress').actor.onboardingProgress).toBe(0.5);
  });

  it('composes fragments with later values winning', () => {
    const s = composeScenario(
      PRESETS['first-week'],
      { id: 'rep-week', name: 'Rep week' },
      fragments.role('member'),
      fragments.network('slow', 300),
      fragments.featureFlags({ beta: true })
    );
    expect(s).toMatchObject({
      id: 'rep-week',
      actor: { role: 'member', joinedDaysAgo: 7 },
      environment: { network: 'slow', latencyMs: 300 },
      organization: { featureFlags: { beta: true }, ageDays: 7 },
    });
    expect(() => composeScenario({ id: 'Bad Id', name: 'x', seed: 1, referenceTime: REF })).toThrow(
      /kebab-case/
    );
    expect(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2] } }, undefined)).toEqual({
      a: { b: 1, c: [2] },
    });
  });

  it('resolves extends against own scenarios and presets, detecting cycles and duplicates', () => {
    const resolved = resolveScenarios(
      [
        { id: 'first-week', extends: 'first-week', name: 'Week', seed: 1, referenceTime: REF },
        { id: 'child', extends: 'first-week', name: 'Child', actor: { role: 'viewer' } },
      ],
      PRESETS
    );
    expect(resolved[1]).toMatchObject({ seed: 1, actor: { role: 'viewer', joinedDaysAgo: 7 } });
    expect(() =>
      resolveScenarios([
        { id: 'a', extends: 'b', name: 'A', seed: 1, referenceTime: REF },
        { id: 'b', extends: 'a', name: 'B', seed: 1, referenceTime: REF },
      ])
    ).toThrow(/cycle: a → b → a/);
    expect(() =>
      resolveScenarios([
        { id: 'a', name: 'A', seed: 1, referenceTime: REF },
        { id: 'a', name: 'A', seed: 1, referenceTime: REF },
      ])
    ).toThrow(/Duplicate/);
    expect(() => resolveScenarios([{ id: 'a', extends: 'nope', name: 'A' }], PRESETS)).toThrow(
      /unknown scenario or preset "nope"/
    );
  });
});

describe('generateTeam', () => {
  it('always creates the actor with role and tenure, inside the org lifetime', () => {
    const s = scenario({
      organization: { ageDays: 180, size: 12, subscription: 'expired' },
      actor: { id: 'user_0001', role: 'member', joinedDaysAgo: 0, onboardingComplete: false },
    });
    const ctx = createGenerateContext(s);
    const team = generateTeam(ctx);
    expect(team.personas).toHaveLength(12);
    expect(new Set(team.personas.map((p) => p.id)).size).toBe(12);
    expect(team.actor).toMatchObject({ id: 'user_0001', joinedAt: REF, onboardingComplete: false });
    expect(team.organization).toMatchObject({
      createdAt: new Date(Date.parse(REF) - 180 * MS_PER_DAY).toISOString(),
      plan: 'pro',
      billingStatus: 'expired',
    });
    expect(team.memberships.find((m) => m.personaId === 'user_0001')?.role).toBe('member');
    const created = Date.parse(team.organization.createdAt);
    for (const p of team.personas) {
      expect(Date.parse(p.joinedAt)).toBeGreaterThanOrEqual(created);
      expect(Date.parse(p.joinedAt)).toBeLessThanOrEqual(Date.parse(REF));
      expect(p.email).toMatch(/@example\.com$/);
    }
    expect(new Set(team.personas.map((p) => p.email)).size).toBe(12);
    expect(validateWorld({ ...team, tables: {} }, { referenceTime: REF })).toEqual([]);
    expect(generateTeam(createGenerateContext(s))).toEqual(team);
  });

  it('clamps an actor who would predate the organization', () => {
    const s = scenario({ organization: { ageDays: 3 }, actor: { joinedDaysAgo: 30 } });
    const team = generateTeam(createGenerateContext(s));
    expect(team.actor.joinedAt).toBe(team.organization.createdAt);
  });
});

describe('validateWorld', () => {
  it('reports broken relations, duplicate ids and out-of-range timestamps', () => {
    const ctx = createGenerateContext(scenario({ organization: { ageDays: 10, size: 2 } }));
    const team = generateTeam(ctx);
    const ids = createIdFactory();
    const world = {
      ...team,
      tables: {
        companies: [{ id: 'c1' }],
        deals: [
          { id: ids.next('deal'), companyId: 'c1', ownerId: 'user_0001', createdAt: REF },
          {
            id: ids.next('deal'),
            companyId: null,
            ownerId: 'ghost',
            createdAt: '2020-01-01T00:00:00Z',
          },
          {
            id: 'deal_0001',
            companyId: ['c1', 'c2'],
            ownerId: 'user_0001',
            createdAt: '2030-01-01T00:00:00Z',
          },
        ],
      },
    };
    const violations = validateWorld(world, {
      relations: { deals: { companyId: 'companies', ownerId: 'py_personas' } },
      timestamps: { deals: ['createdAt'] },
      referenceTime: REF,
    });
    expect(violations.map((v) => `${v.rowId}.${v.field}: ${v.message}`).sort()).toEqual(
      [
        'deal_0001.id: duplicate id "deal_0001"',
        'deal_0002.ownerId: ownerId → "ghost" does not exist in py_personas',
        'deal_0002.createdAt: createdAt is before the organization was created',
        'deal_0001.companyId: companyId → "c2" does not exist in companies',
        'deal_0001.createdAt: createdAt is after the reference time',
      ].sort()
    );
    const broken = {
      ...team,
      memberships: [{ ...team.memberships[0], personaId: 'nobody' }],
    } as never;
    expect(validateWorld(broken)).toEqual([
      expect.objectContaining({ table: 'py_memberships', field: 'personaId' }),
    ]);
  });
});

describe('dailyEvents', () => {
  const ctx = { scenario: scenario() };
  const make = ({ rng, index }: { rng: { int(a: number, b: number): number }; index: number }) => ({
    type: 'ping',
    payload: { n: rng.int(0, 1000), index },
  });
  const day = (n: number) => new Date(Date.parse(REF) + n * MS_PER_DAY);

  it('is window independent: 7 × 1 day equals 1 × 7 days', () => {
    const whole = dailyEvents(ctx, {
      from: day(0),
      to: day(7),
      perDay: ({ rng }) => rng.int(0, 4),
      make,
    });
    const pieces = Array.from({ length: 7 }, (_, i) =>
      dailyEvents(ctx, { from: day(i), to: day(i + 1), perDay: ({ rng }) => rng.int(0, 4), make })
    ).flat();
    expect(pieces).toEqual(whole);
    expect(whole.length).toBeGreaterThan(0);
    expect(new Set(whole.map((e) => e.id)).size).toBe(whole.length);
    for (const event of whole) {
      expect(event.id).toMatch(/^evt:demo:\d{4}-\d{2}-\d{2}:\d+$/);
      expect(Date.parse(event.at)).toBeGreaterThan(day(0).getTime());
      expect(Date.parse(event.at)).toBeLessThanOrEqual(day(7).getTime());
      expect(event.source).toBe('timeline');
    }
    expect(dailyEvents(ctx, { from: day(1), to: day(1), perDay: 3, make })).toEqual([]);
  });

  it('can skip slots and respects hours', () => {
    const events = dailyEvents(ctx, {
      from: day(0),
      to: day(3),
      perDay: 5,
      hours: [13, 14],
      make: (slot) => (slot.index % 2 === 0 ? { type: 'even', payload: null } : null),
    });
    for (const event of events) expect(new Date(event.at).getUTCHours()).toBe(13);
    expect(events.every((e) => Number(e.id.split(':').at(-1)) % 2 === 0)).toBe(true);
  });
});
