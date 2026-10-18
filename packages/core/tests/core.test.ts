import { describe, expect, it } from 'vitest';
import {
  buildScenarioLink,
  checkSlug,
  createIdFactory,
  createPermissionPolicy,
  createRng,
  createSimulationClock,
  createSimulationEnvironment,
  OverridesSchema,
  parseScenarioLink,
  resolveEffective,
  resolveShell,
  ScenarioSchema,
  safeParseManifest,
  slugify,
  utf8ByteLengthExceeds,
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

describe('manifest preview shell', () => {
  const base = {
    id: 'example.crm',
    slug: 'crm-demo',
    name: 'CRM',
    version: '0.1.0',
    storage: { namespace: 'crm-demo', schemaVersion: 1 },
  };
  const parse = (preview: unknown, extra: object = {}) =>
    safeParseManifest({ ...base, ...extra, ...(preview === undefined ? {} : { preview }) });

  it('parses existing manifests unchanged except for the auto shell default', () => {
    for (const [preview, viewport] of [
      [undefined, 'desktop'],
      [{ viewport: 'desktop' }, 'desktop'],
      [{ viewport: 'iphone' }, 'iphone'],
    ] as const) {
      const result = parse(preview);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.preview).toEqual({ viewport, shell: 'auto' });
    }
  });

  it('resolves auto from the platform and passes concrete shells through', () => {
    expect(resolveShell('auto', 'mobile')).toBe('phone');
    expect(resolveShell('auto', 'desktop')).toBe('none');
    expect(resolveShell('auto', 'responsive')).toBe('none');
    expect(resolveShell('browser', 'mobile')).toBe('browser');
    expect(resolveShell('none', 'mobile')).toBe('none');
  });

  it('accepts every shell, catalog devices, orientations and fictional chrome', () => {
    for (const shell of [
      'auto',
      'none',
      'phone',
      'tablet',
      'desktop-window',
      'browser',
      'widget-host',
      'extension-popup',
      'side-panel',
    ]) {
      expect(parse({ shell }).success, shell).toBe(true);
    }
    const full = parse({
      viewport: 'iphone',
      shell: 'side-panel',
      device: 'phone-punch-hole',
      orientation: 'landscape',
      chrome: {
        os: 'windows',
        origin: 'https://app.northwind.example',
        hostName: 'Northwind Outfitters (fictional)',
        hostVariant: 'code-editor',
      },
    });
    expect(full.success).toBe(true);
    for (const origin of [
      'https://crm.example',
      'https://example.com',
      'https://help.example.com',
      'https://a.b.example',
    ]) {
      expect(parse({ chrome: { origin } }).success, origin).toBe(true);
    }
  });

  it('rejects bad shells, devices, orientations and real or unsafe origins', () => {
    expect(parse({ shell: 'watch' }).success).toBe(false);
    expect(parse({ shell: 'PHONE' }).success).toBe(false);
    expect(parse({ device: 'iphone' }).success).toBe(false);
    expect(parse({ orientation: 'sideways' }).success).toBe(false);
    expect(parse({ chrome: { os: 'linux' } }).success).toBe(false);
    expect(parse({ chrome: { hostVariant: 'spreadsheet' } }).success).toBe(false);
    expect(parse({ chrome: { unknown: true } }).success).toBe(false);
    for (const origin of [
      'https://dailybot.com',
      'http://crm.example',
      'https://example.com.evil.io',
      'https://notexample.com',
      'https://crm.example/path',
      'https://crm.example:8080',
      'https://user@crm.example',
      'https://.example',
      'https://-x.example',
      'https://CRM.example',
      'javascript:alert(1)//.example',
      'https://crm.example\n',
    ]) {
      expect(parse({ chrome: { origin } }).success, origin).toBe(false);
    }
  });

  it('lets scenarios and overrides carry shell, device and orientation', () => {
    const scenario = ScenarioSchema.parse({
      id: 'phone-view',
      name: 'Phone view',
      seed: 1,
      referenceTime: '2026-10-16T10:00:00Z',
      appearance: { shell: 'phone', device: 'phone-pill', orientation: 'landscape' },
    });
    expect(scenario.appearance).toEqual({
      shell: 'phone',
      device: 'phone-pill',
      orientation: 'landscape',
    });
    expect(OverridesSchema.parse({ shell: 'tablet', device: 'tablet' })).toEqual({
      shell: 'tablet',
      device: 'tablet',
    });
    expect(OverridesSchema.safeParse({ shell: 'watch' }).success).toBe(false);
    expect(OverridesSchema.safeParse({ device: 'nope' }).success).toBe(false);
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
    env.set({ failureScope: ['agents.'] });
    await expect(env.run('save', () => 1)).resolves.toBe(1);
    await expect(env.run('agents.atlas', () => 1)).rejects.toMatchObject({ code: 'server-error' });
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
    expect(parseScenarioLink('?sandbox=compare-a').sandbox).toBe('compare-a');
    expect(parseScenarioLink('?sandbox=../x').sandbox).toBeUndefined();
  });

  it('accepts ?shell= from the enum only and round-trips it', () => {
    expect(parseScenarioLink('?shell=phone').shell).toBe('phone');
    expect(parseScenarioLink('?shell=side-panel').shell).toBe('side-panel');
    for (const bad of ['watch', 'Phone', '', '<script>', 'phone%00']) {
      expect(parseScenarioLink(`?shell=${bad}`).shell, bad).toBeUndefined();
    }
    const link = buildScenarioLink('/p/crm-demo/', { scenario: 'active-month', shell: 'tablet' });
    expect(link).toBe('/p/crm-demo/?scenario=active-month&shell=tablet');
    expect(parseScenarioLink(new URL(link, 'http://x.example').search)).toEqual({
      scenario: 'active-month',
      shell: 'tablet',
    });
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

describe('environment patches', () => {
  it('do not fill defaults, so overriding latency keeps the scenario network', async () => {
    const { OverridesSchema } = await import('../src/index.ts');
    expect(OverridesSchema.parse({ environment: { latencyMs: 250 } })).toEqual({
      environment: { latencyMs: 250 },
    });
  });
});

describe('snapshot size limit', () => {
  it('measures UTF-8 bytes, not UTF-16 code units', () => {
    expect(utf8ByteLengthExceeds('a'.repeat(10), 10)).toBe(false);
    expect(utf8ByteLengthExceeds('a'.repeat(11), 10)).toBe(true);
    // 4 emoji = 8 UTF-16 code units but 16 UTF-8 bytes.
    expect(utf8ByteLengthExceeds('😀😀😀😀', 10)).toBe(true);
    expect(utf8ByteLengthExceeds('😀😀', 10)).toBe(false);
  });
});
