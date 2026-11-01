import { createIdFactory, MS_PER_DAY, parseScenario, type Scenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { SECRET_PATTERNS, scanFixtureText } from '../src/fixture-guard.ts';
import {
  createGenerateContext,
  dailyEvents,
  generateTeam,
  PRESETS,
  resolveScenarios,
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
});

describe('presets and composition', () => {
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
});

// --- merged from fixture-guard.test.ts ---

describe('scanFixtureText', () => {
  it('flags real-looking email domains with path and domain-only detail', () => {
    const findings = scanFixtureText('write to someone@gmail.com', { path: 'notes.body' });
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'real-email',
        path: 'notes.body',
        rule: 'real-email',
        detail: 'gmail.com',
      }),
    ]);
    expect(findings[0]?.message).toMatch(/gmail\.com/);
    expect(findings[0]?.message).toMatch(/example\.com/);
    expect(findings[0]?.message).not.toMatch(/someone@/);
  });

  it('detects representative secret shapes without echoing the secret', () => {
    const slack = ['token ', 'xox', 'b-1234567890-abcdef'].join('');
    const slackHit = scanFixtureText(slack, { path: 'config.token' });
    expect(slackHit[0]).toMatchObject({
      kind: 'secret',
      path: 'config.token',
      detail: 'Slack token',
    });
    expect(slackHit[0]?.message).not.toMatch(/xoxb/);
    expect(slackHit[0]?.message).toMatch(/Slack token/);

    // Synthetic id (not the public AWS docs example) so runners cannot strip it.
    const awsKey = `AKIA${'B'.repeat(16)}`;
    const aws = scanFixtureText(`key=${awsKey}`);
    expect(aws.some((f) => f.rule === 'secret:aws-access-key')).toBe(true);
    expect(aws[0]?.message).not.toContain(awsKey);

    const gh = scanFixtureText(`auth ${'ghp_'}${'a'.repeat(36)}`);
    expect(gh.some((f) => f.rule === 'secret:github-token')).toBe(true);

    const stripe = scanFixtureText(`pk_live_${'x'.repeat(20)}`);
    expect(stripe.some((f) => f.rule === 'secret:stripe-live-key')).toBe(true);

    const pem = scanFixtureText(['-----BEGIN ', 'PRIVATE KEY-----'].join(''));
    expect(pem.some((f) => f.rule === 'secret:private-key')).toBe(true);

    const jwt = [
      'eyJ',
      'hbGciOiJIUzI1NiJ9',
      '.',
      'eyJ',
      'zdWIiOiIxMjM0NTY3ODkwIn0',
      '.',
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    ].join('');
    expect(scanFixtureText(jwt).some((f) => f.rule === 'secret:signed-jwt')).toBe(true);

    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });
});
