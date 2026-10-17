import { describe, expect, it } from 'vitest';
import {
  checkSlug,
  createIdFactory,
  createPermissionPolicy,
  createRng,
  createSimulationClock,
  createSimulationEnvironment,
  parseScenarioLink,
  resolveEffective,
  safeParseManifest,
  slugify,
  validateSnapshot,
} from '../src/index.ts';

describe('slugs', () => {
  it('accepts kebab-case and rejects traversal, reserved and malformed input', () => {
    expect(checkSlug('my-crm').ok).toBe(true);
    for (const bad of [
      '../etc',
      'My-CRM',
      'a',
      'crm--demo',
      '-crm',
      'crm/x',
      'templates',
      '9lives',
    ]) {
      expect(checkSlug(bad).ok, bad).toBe(false);
    }
    expect(slugify('  My CRM v2! ')).toBe('my-crm-v2');
  });
});

describe('manifest', () => {
  it('applies defaults and rejects unknown keys', () => {
    const ok = safeParseManifest({
      id: 'example.crm',
      slug: 'crm-demo',
      name: 'CRM',
      version: '0.1.0',
      storage: { namespace: 'crm-demo', schemaVersion: 1 },
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.build.includeDevtools).toBe(false);
    expect(safeParseManifest({ id: 'x', slug: 'crm' }).success).toBe(false);
  });
});

describe('determinism', () => {
  it('produces the same stream for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.int(0, 1000))).toEqual(
      Array.from({ length: 5 }, () => b.int(0, 1000))
    );
    expect(createRng(42).fork('deals').next()).toBe(createRng(42).fork('deals').next());
    const ids = createIdFactory();
    expect([ids.next('deal'), ids.next('deal'), ids.next('company')]).toEqual([
      'deal_0001',
      'deal_0002',
      'company_0001',
    ]);
  });
});

describe('clock', () => {
  it('separates preview from committed time', () => {
    const clock = createSimulationClock({ referenceTime: '2026-10-16T10:00:00Z' });
    clock.preview({ days: 7 });
    expect(clock.isPreviewing()).toBe(true);
    expect(clock.committed().toISOString()).toBe('2026-10-16T10:00:00.000Z');
    clock.clearPreview();
    clock.commitAdvance({ days: 1 });
    expect(clock.now().toISOString()).toBe('2026-10-17T10:00:00.000Z');
    expect(() => clock.commitAdvance({ days: -1 })).toThrow();
    clock.resetClock();
    expect(clock.now().toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });
});

describe('policy', () => {
  it('honors wildcard, denials and record rules', () => {
    const policy = createPermissionPolicy({
      roles: { admin: ['*', '-billing:manage'], viewer: ['deals:read'], rep: ['deals:update'] },
      rules: {
        'deals:update': (p, deal) => (deal as { ownerId: string }).ownerId === p.persona.id,
      },
    });
    const principal = (role: string) => ({
      persona: { id: 'u1' } as never,
      organization: null,
      membership: null,
      role,
      capabilities: policy.capabilitiesFor(role),
    });
    expect(policy.can(principal('admin'), 'deals:delete')).toBe(true);
    expect(policy.can(principal('admin'), 'billing:manage')).toBe(false);
    expect(policy.can(principal('viewer'), 'deals:update')).toBe(false);
    expect(policy.can(principal('rep'), 'deals:update', { ownerId: 'u1' })).toBe(true);
    expect(policy.can(principal('rep'), 'deals:update', { ownerId: 'u2' })).toBe(false);
    expect(() => policy.assert(principal('viewer'), 'deals:create')).toThrow(/Permission denied/);
  });
});

describe('environment', () => {
  it('fails reproducibly and respects offline', async () => {
    const env = createSimulationEnvironment({ sleep: async () => {} });
    await expect(env.run('save', () => 1)).resolves.toBe(1);
    env.set({ network: 'offline' });
    await expect(env.run('save', () => 1)).rejects.toMatchObject({ code: 'offline' });
    env.set({ network: 'online', failureMode: 'server-error', failureRate: 1 });
    await expect(env.run('save', () => 1)).rejects.toMatchObject({ code: 'server-error' });
  });
});

describe('links, overrides and snapshots', () => {
  it('parses only safe link params', () => {
    expect(parseScenarioLink('?scenario=active-month&actor=user_0002&seed=42&mode=dark')).toEqual({
      scenario: 'active-month',
      actor: 'user_0002',
      seed: 42,
      mode: 'dark',
    });
    expect(parseScenarioLink('?scenario=<script>&seed=-1')).toEqual({});
  });

  it('resolves effective values by precedence', () => {
    expect(resolveEffective({ preference: 'ocean', scenario: 'violet' }, 'mono')).toEqual({
      value: 'ocean',
      source: 'preference',
    });
  });

  it('rejects snapshots for another prototype', () => {
    const result = validateSnapshot(
      {
        format: 'protoyard.snapshot',
        formatVersion: 1,
        id: 's1',
        name: 'x',
        prototypeId: 'example.other',
        prototypeVersion: '0.1.0',
        schemaVersion: 1,
        scenarioId: null,
        scenarioVersion: null,
        seed: null,
        referenceTime: null,
        createdAt: '2026-10-16T10:00:00Z',
        actorId: null,
        organizationId: null,
        clock: null,
        environment: {},
        tables: [],
      },
      { prototypeId: 'example.crm', schemaVersion: 1, tables: [] }
    );
    expect(result.ok).toBe(false);
  });
});
