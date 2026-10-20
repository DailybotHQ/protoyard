import type { DataDensity, ScenarioInput } from '@protoyard/core';
import { isPersonaAvatar, PERSONA_AVATAR_ID_PATTERN, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { helpdeskBlueprint } from '../../../tests/fixtures/blueprint-prototype.ts';
import {
  ALLOWED_FAKE_PATHS,
  BLUEPRINT_GENERATOR_SDK,
  blueprintGeneratorVersion,
  createBlueprintGenerator,
  hashBlueprint,
  topologicalEntities,
} from '../src/generator.ts';
import { deriveIntegrity, parseBlueprint, safeParseBlueprint } from '../src/index.ts';

const densitites: DataDensity[] = ['empty', 'sparse', 'normal', 'dense', 'massive'];

function scenario(density: DataDensity, seed = 50_001): ScenarioInput {
  return {
    id: `gen-${density}`,
    name: `Generator ${density}`,
    seed,
    referenceTime: '2026-06-01T09:00:00.000Z',
    density,
    organization: {
      id: 'org_gen',
      name: 'Generator Org',
      size: 6,
      ageDays: 90,
      subscription: 'pro',
    },
  };
}

const richBlueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Generator fixture',
  entities: [
    {
      name: 'company',
      plural: 'companies',
      fields: [
        { name: 'name', kind: 'text', required: true, fake: 'company.name', minLength: 2 },
        { name: 'website', kind: 'url' },
        { name: 'industry', kind: 'enum', values: ['saas', 'agency', 'other'], default: 'saas' },
      ],
      titleField: 'name',
      features: { audit: true, notifications: true },
    },
    {
      name: 'contact',
      plural: 'contacts',
      fields: [
        { name: 'fullName', kind: 'text', required: true, fake: 'person.fullName' },
        { name: 'email', kind: 'email', required: true },
        { name: 'company', kind: 'relation', to: 'company', required: true, onDelete: 'cascade' },
        { name: 'owner', kind: 'persona' },
        { name: 'tags', kind: 'tags' },
        { name: 'score', kind: 'integer', min: 0, max: 100 },
        { name: 'budget', kind: 'money', min: 0, max: 500_000 },
        { name: 'active', kind: 'boolean', default: true },
        { name: 'joinedOn', kind: 'date' },
      ],
      titleField: 'fullName',
      ownerField: 'owner',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  notifications: [
    {
      on: 'create',
      entity: 'contact',
      notify: 'owner',
      title: 'New contact {fullName}',
    },
  ],
});

describe('createBlueprintGenerator', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    const gen = createBlueprintGenerator(helpdeskBlueprint);
    const a = gen.generate(createGenerateContext(parseScenario(scenario('normal', 42))));
    const b = gen.generate(createGenerateContext(parseScenario(scenario('normal', 42))));
    const c = gen.generate(createGenerateContext(parseScenario(scenario('normal', 99))));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(gen.generatorVersion).toBe(blueprintGeneratorVersion(helpdeskBlueprint));
    expect(gen.generatorVersion).not.toBe(0);
  });

  it('passes validateWorld for every density preset', () => {
    const gen = createBlueprintGenerator(richBlueprint);
    const integrity = deriveIntegrity(richBlueprint);
    for (const density of densitites) {
      const s = parseScenario(scenario(density, 7_700 + densitites.indexOf(density)));
      const world = gen.generate(createGenerateContext(s));
      expect(
        validateWorld(world, { ...integrity, referenceTime: s.referenceTime }),
        density
      ).toEqual([]);
      if (density === 'empty') {
        expect(world.tables.companies ?? []).toHaveLength(0);
        expect(world.tables.contacts ?? []).toHaveLength(0);
      } else {
        expect((world.tables.companies ?? []).length).toBeGreaterThan(0);
        expect((world.tables.contacts ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it('uses only example.com / example.org emails and topological order', () => {
    const order = topologicalEntities(richBlueprint).map((e) => e.name);
    expect(order.indexOf('company')).toBeLessThan(order.indexOf('contact'));

    const gen = createBlueprintGenerator(richBlueprint);
    const world = gen.generate(createGenerateContext(parseScenario(scenario('dense', 12))));
    const contacts = (world.tables.contacts ?? []) as Array<{ email?: string }>;
    for (const row of contacts) {
      expect(row.email).toMatch(/@example\.(com|org)$/);
    }
    // Audit history is seeded when features.audit is on and density > empty.
    expect((world.tables.auditEntries ?? []).length).toBeGreaterThan(0);
    expect((world.tables.notifications ?? []).length).toBeGreaterThan(0);
  });

  it('honors allow-listed fake paths and stable generatorVersion hashing', () => {
    expect(ALLOWED_FAKE_PATHS).toContain('company.name');
    expect(hashBlueprint(richBlueprint)).toBe(hashBlueprint(richBlueprint));
    expect(blueprintGeneratorVersion(richBlueprint)).toBe(
      blueprintGeneratorVersion(parseBlueprint(JSON.parse(JSON.stringify(richBlueprint))))
    );
    expect(BLUEPRINT_GENERATOR_SDK).toBeGreaterThan(0);

    const gen = createBlueprintGenerator(richBlueprint);
    const world = gen.generate(createGenerateContext(parseScenario(scenario('normal', 3))));
    const companies = world.tables.companies ?? [];
    expect(companies[0]?.name).toEqual(expect.any(String));
  });

  it('gives every team persona a seeded, unique library avatar', () => {
    const gen = createBlueprintGenerator(richBlueprint);
    const run = (seed: number) =>
      gen.generate(createGenerateContext(parseScenario(scenario('normal', seed))));
    const world = run(5);
    expect(world.personas.length).toBeGreaterThan(1);
    for (const persona of world.personas) {
      expect(persona.avatar, persona.id).toMatch(PERSONA_AVATAR_ID_PATTERN);
      expect(isPersonaAvatar(persona.avatar), persona.id).toBe(true);
    }
    expect(new Set(world.personas.map((p) => p.avatar)).size).toBe(world.personas.length);
    expect(JSON.stringify(run(5))).toBe(JSON.stringify(world));
    expect(run(6).personas.map((p) => p.avatar)).not.toEqual(world.personas.map((p) => p.avatar));
    expect(BLUEPRINT_GENERATOR_SDK).toBe(6);
  });
});

describe('fictional contact data', () => {
  it('keeps url, email and phone values on example domains and 555 numbers despite fake hints', () => {
    const contactBlueprint = parseBlueprint({
      formatVersion: 1,
      name: 'Contact fixture',
      entities: [
        {
          name: 'account',
          plural: 'accounts',
          seedCount: 40,
          titleField: 'name',
          fields: [
            { name: 'name', kind: 'text', required: true, fake: 'company.name' },
            { name: 'domain', kind: 'url', fake: 'internet.url' },
            { name: 'mobile', kind: 'phone', fake: 'phone.number' },
            { name: 'email', kind: 'email', fake: 'internet.email' },
            { name: 'site', kind: 'text', fake: 'internet.url' },
            { name: 'contact', kind: 'text', fake: 'internet.email' },
            { name: 'line', kind: 'text', fake: 'phone.number' },
          ],
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    const gen = createBlueprintGenerator(contactBlueprint);
    const rows =
      gen.generate(createGenerateContext(parseScenario(scenario('normal', 11)))).tables.accounts ??
      [];
    expect(rows.length).toBeGreaterThan(0);
    const url = /^https:\/\/example\.(?:com|org)\//;
    const email = /@example\.(?:com|org)$/;
    const phone = /^\+1-555-\d{3}-\d{4}$/;
    for (const row of rows) {
      for (const [key, pattern] of [
        ['domain', url],
        ['site', url],
        ['email', email],
        ['contact', email],
        ['mobile', phone],
        ['line', phone],
      ] as const) {
        const value = row[key];
        if (value === null || value === undefined) continue;
        expect(String(value), key).toMatch(pattern);
      }
    }
  });
});

describe('generator source hygiene', () => {
  it('exposes the generator without ambient PRNG/clock APIs on the public surface', () => {
    // AC-nondet is the bash gate on packages/blueprint/src/generator.ts.
    // Here we only assert the module exports the factory used by that file.
    expect(typeof createBlueprintGenerator).toBe('function');
    expect(BLUEPRINT_GENERATOR_SDK).toBeGreaterThan(0);
  });
});

/** A fictional booking desk that uses every distribution hint. */
const distBlueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Distribution fixture',
  entities: [
    {
      name: 'booking',
      plural: 'bookings',
      seedCount: 60,
      fields: [
        { name: 'title', kind: 'text', required: true, fake: 'company.buzzPhrase' },
        {
          name: 'status',
          kind: 'enum',
          values: ['requested', 'confirmed', 'done', 'cancelled'],
          default: 'requested',
          required: true,
        },
        {
          name: 'channel',
          kind: 'enum',
          values: ['web', 'phone', 'walk-in'],
          weights: [6, 3, 0],
        },
        { name: 'startsAt', kind: 'datetime', window: 'future' },
        { name: 'heldOn', kind: 'date', window: { from: -10, to: 10 } },
        { name: 'loggedOn', kind: 'date', window: 'past' },
        { name: 'amount', kind: 'money', min: 0, max: 200_000, trend: 'growth' },
        { name: 'rating', kind: 'number', min: 0, max: 5, trend: 'decline' },
        { name: 'guests', kind: 'integer', min: 1, max: 40, trend: 'seasonal' },
        { name: 'street', kind: 'text', fake: 'location.streetAddress' },
      ],
      titleField: 'title',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});

describe('generator distributions', () => {
  const world = (density: DataDensity = 'normal', seed = 4_242) =>
    createBlueprintGenerator(distBlueprint).generate(
      createGenerateContext(parseScenario(scenario(density, seed)))
    );
  const rows = (w = world()) => (w.tables.bookings ?? []) as Array<Record<string, unknown>>;
  const now = Date.parse('2026-06-01T09:00:00.000Z');
  const DAY = 86_400_000;

  it('honors seedCount at normal density and scales it', () => {
    expect(rows()).toHaveLength(60);
    expect(rows(world('sparse'))).toHaveLength(15);
  });

  it('spreads enums over every value, and weights skip zero-weight values', () => {
    const status = new Set(rows().map((r) => r.status));
    expect([...status].sort()).toEqual(['cancelled', 'confirmed', 'done', 'requested']);
    const channels = rows().map((r) => r.channel);
    expect(channels).not.toContain('walk-in');
    const web = channels.filter((c) => c === 'web').length;
    const phone = channels.filter((c) => c === 'phone').length;
    expect(web).toBeGreaterThan(phone);
  });

  it('places dates inside their windows, with future dates and business hours', () => {
    const all = rows();
    const starts = all.map((r) => Date.parse(String(r.startsAt)));
    expect(starts.some((ms) => ms > now)).toBe(true);
    for (const ms of starts) {
      expect(ms).toBeGreaterThanOrEqual(now - DAY);
      expect(ms).toBeLessThanOrEqual(now + 30 * DAY);
      const hour = new Date(ms).getUTCHours();
      if (ms > now) {
        expect(hour).toBeGreaterThanOrEqual(9);
        expect(hour).toBeLessThan(17);
        expect(new Date(ms).getUTCMinutes() % 15).toBe(0);
      }
    }
    const held = all.map((r) => Date.parse(String(r.heldOn)));
    expect(held.some((ms) => ms < now) && held.some((ms) => ms > now)).toBe(true);
    for (const ms of held) {
      expect(ms).toBeGreaterThanOrEqual(now - 10 * DAY);
      expect(ms).toBeLessThanOrEqual(now + 10 * DAY);
    }
    expect(all.every((r) => Date.parse(String(r.loggedOn)) <= now)).toBe(true);
  });

  it('keeps future windows out of the reference-time check and the world valid', () => {
    const integrity = deriveIntegrity(distBlueprint);
    expect(integrity.timestamps?.bookings).toEqual(['createdAt', 'updatedAt', 'loggedOn']);
    for (const density of densitites) {
      const s = parseScenario(scenario(density, 900 + densitites.indexOf(density)));
      const w = createBlueprintGenerator(distBlueprint).generate(createGenerateContext(s));
      expect(validateWorld(w, { ...integrity, referenceTime: s.referenceTime }), density).toEqual(
        []
      );
    }
  });

  it('follows the trend over createdAt: monthly averages rise for growth, fall for decline', () => {
    const all = rows(world('dense', 77));
    const monthly = (prop: string) => {
      const sums = new Map<string, { sum: number; n: number }>();
      for (const r of all) {
        const month = String(r.createdAt).slice(0, 7);
        const cell = sums.get(month) ?? { sum: 0, n: 0 };
        cell.sum += r[prop] as number;
        cell.n += 1;
        sums.set(month, cell);
      }
      return [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, c]) => c.sum / c.n);
    };
    const amount = monthly('amount');
    expect(amount.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < amount.length; i++) {
      expect(amount[i]).toBeGreaterThan(amount[i - 1] as number);
    }
    const rating = monthly('rating');
    expect(rating.at(-1)).toBeLessThan(rating[0] as number);
    for (const r of all) {
      expect(Number.isInteger(r.amount)).toBe(true);
      expect(r.amount as number).toBeLessThanOrEqual(200_000);
      expect(Number.isInteger(r.guests)).toBe(true);
      expect(r.guests as number).toBeGreaterThanOrEqual(1);
      expect(r.guests as number).toBeLessThanOrEqual(40);
    }
  });

  it('is byte-identical for the same seed and fills the new fake paths', () => {
    expect(JSON.stringify(world())).toBe(JSON.stringify(world()));
    expect(JSON.stringify(world('normal', 4_243))).not.toBe(JSON.stringify(world()));
    for (const path of [
      'location.streetAddress',
      'commerce.department',
      'company.buzzPhrase',
      'word.words',
    ]) {
      expect(ALLOWED_FAKE_PATHS).toContain(path);
    }
    expect(rows().every((r) => typeof r.street === 'string' && r.street.length > 0)).toBe(true);
  });

  it('changes the generator version when a distribution hint changes', () => {
    const changed = parseBlueprint({
      ...distBlueprint,
      entities: distBlueprint.entities.map((e) => ({ ...e, seedCount: 61 })),
    });
    expect(blueprintGeneratorVersion(changed)).not.toBe(blueprintGeneratorVersion(distBlueprint));
  });
});

describe('distribution hints in the schema', () => {
  const issues = (field: Record<string, unknown>) => {
    const result = safeParseBlueprint({
      formatVersion: 1,
      name: 'Bad',
      entities: [
        {
          name: 'thing',
          plural: 'things',
          fields: [{ name: 'title', kind: 'text' }, field],
          titleField: 'title',
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    return result.success
      ? []
      : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('checks weights length and positivity, and window order', () => {
    expect(issues({ name: 'state', kind: 'enum', values: ['a', 'b'], weights: [1] })).toContain(
      'entities.0.fields.1.weights: weights needs one entry per value (2)'
    );
    expect(issues({ name: 'state', kind: 'enum', values: ['a', 'b'], weights: [0, 0] })).toContain(
      'entities.0.fields.1.weights: weights needs at least one positive entry'
    );
    expect(issues({ name: 'due', kind: 'date', window: { from: 5, to: -5 } })).toContain(
      'entities.0.fields.1.window: window.from must not be after window.to'
    );
    expect(issues({ name: 'due', kind: 'date', window: 'around' })).toEqual([]);
    expect(issues({ name: 'amount', kind: 'money', trend: 'seasonal' })).toEqual([]);
  });
});
