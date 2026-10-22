import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Blueprint,
  definePrototypeFromBlueprint,
  deriveAppModel,
  parseBlueprint,
} from '@protoyard/blueprint';
import { definePrototype, type PrototypeRuntime } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import analyticsJson from '../../../blueprints/quick/analytics.json';
import saasJson from '../../../blueprints/quick/saas-onboarding.json';
import { withSaasKit } from '../src/archetypes/business/definition.ts';
import {
  createBusinessAdapter,
  dashboardNumbers,
  isBusinessArchetype,
  withArchetypeNav,
} from '../src/archetypes/business/index.ts';
import { type BootedPlayer, bootPlayer } from '../src/boot.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { ensurePlayerBuild } from './support/serve-dist.ts';

configure({ asyncUtilTimeout: 20_000 });

const analytics = parseBlueprint(analyticsJson);
const saas = parseBlueprint(saasJson);
const ROOT = join(process.cwd());
const DIST = join(ROOT, 'packages/player/dist/app');

let booted: BootedPlayer | undefined;
afterEach(async () => {
  await booted?.destroy();
  booted = undefined;
  document.body.replaceChildren();
  window.location.hash = '';
});

/** Boots the real player (crud app, kits, router) on a fresh in-memory IndexedDB. */
async function boot(blueprint: Blueprint, indexedDB = new IDBFactory()) {
  const target = document.body.appendChild(document.createElement('div'));
  booted = await bootPlayer({
    blueprint,
    target,
    search: '',
    indexFactory: indexedDB,
    createRuntime: (definition, options) =>
      createPrototypeRuntime(definition, {
        ...options,
        indexedDB,
        IDBKeyRange,
        sleep: async () => {},
      }),
  });
  expect(booted.error).toBeNull();
  return { player: booted, runtime: booted.runtime as PrototypeRuntime, indexedDB };
}

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(n: string): { toArray(): Promise<Record<string, unknown>[]> } })
    .table(name)
    .toArray();

describe('business archetype adapter', () => {
  it('reads the analytics slots and picks date, type and value fields', () => {
    const adapter = createBusinessAdapter(analytics);
    expect(adapter).toMatchObject({
      id: 'analytics',
      path: '/analytics',
      navLabel: 'Analytics',
      saas: null,
    });
    expect(adapter.analytics).toEqual({
      eventEntity: 'event',
      metricEntity: 'metric',
      dateField: 'occurredAt',
      typeField: 'type',
      typeValues: ['signup', 'activation', 'purchase'],
      valueField: 'revenue',
      valueUnit: 'cents',
      valueLabel: 'Revenue',
      metricNameField: 'name',
      metricValueField: 'value',
    });
  });

  it('reads the SaaS slots and refuses other blueprints', () => {
    expect(createBusinessAdapter(saas)).toMatchObject({
      id: 'saas-onboarding',
      path: '/onboarding',
      saas: { workspaceEntity: 'workspace', memberEntity: 'teammate' },
    });
    const plain = parseBlueprint(demo);
    expect(isBusinessArchetype(plain)).toBe(false);
    expect(() => createBusinessAdapter(plain)).toThrow(/saas-onboarding or analytics/);
  });

  it('adds the archetype screen to navigation right after Home', () => {
    const model = withArchetypeNav(deriveAppModel(analytics), createBusinessAdapter(analytics));
    expect(model.nav.slice(0, 2).map((item) => item.path)).toEqual(['/', '/analytics']);
    expect(model.navGroups[0]?.paths.slice(0, 2)).toEqual(['/', '/analytics']);
    expect(model.icons).toContain('chart-line');
    expect(withArchetypeNav(model, createBusinessAdapter(analytics))).toBe(model);
  });
});

describe('dashboard numbers', () => {
  const fields = createBusinessAdapter(analytics).analytics!;
  const now = Date.parse('2026-06-15T12:00:00.000Z');
  const rows = [
    { id: 'e1', type: 'signup', occurredAt: '2026-06-14T10:00:00.000Z', revenue: 0 },
    { id: 'e2', type: 'purchase', occurredAt: '2026-06-13T10:00:00.000Z', revenue: 4500 },
    { id: 'e3', type: 'signup', occurredAt: '2026-06-05T10:00:00.000Z', revenue: 0 },
    { id: 'e4', type: 'purchase', occurredAt: '2026-06-04T10:00:00.000Z', revenue: 1200 },
    { id: 'e5', type: 'signup', occurredAt: 'not a date', revenue: 99 },
  ];

  it('counts the range and its comparison, by type and value, deterministically', () => {
    const value = {
      range: { kind: 'preset', preset: 'last-7-days' },
      comparison: 'previous-period',
      granularity: 'day',
    } as const;
    const numbers = dashboardNumbers(rows, fields, value, now);
    expect(numbers.events).toEqual({ current: 2, previous: 2 });
    expect(numbers.value).toEqual({ current: 4500, previous: 1200 });
    expect(numbers.byType).toEqual([
      { type: 'signup', count: 1, previous: 1 },
      { type: 'activation', count: 0, previous: 0 },
      { type: 'purchase', count: 1, previous: 1 },
    ]);
    expect(dashboardNumbers(rows, fields, value, now)).toEqual(numbers);
    const none = dashboardNumbers(rows, fields, { ...value, comparison: 'none' }, now);
    expect(none.events.previous).toBeNull();
  });
});

describe('SaaS kit definition', () => {
  it('appends the kit stores and capabilities to the blueprint definition', () => {
    const { definition } = definePrototypeFromBlueprint(saas, { namespace: 'bp-saas-test' });
    const withKit = withSaasKit(definition, saas);
    const versions = withKit.database.versions;
    expect(versions.slice(0, -1)).toEqual(definition.database.versions);
    expect(versions.at(-1)?.version).toBe(definition.manifest.storage.schemaVersion + 1);
    expect(Object.keys(versions.at(-1)?.stores ?? {})).toContain('saas_accounts');
    expect(withKit.manifest.storage.schemaVersion).toBe(versions.at(-1)?.version);
    expect(() => definePrototype(withKit)).not.toThrow();
    // Kit rows need a GenerateContext, so the kit drops the context-free path.
    const worldGen = { ...definition, generateWorld: async () => definition.generate as never };
    expect(withSaasKit(worldGen, saas).generateWorld).toBeUndefined();
    expect(withKit.policy?.roles.owner).toEqual(
      expect.arrayContaining(['onboarding:progress', 'billing:manage'])
    );
    expect(withKit.policy?.roles.member).toContain('onboarding:progress');
    expect(withKit.policy?.roles.member).not.toContain('billing:manage');
    expect(withSaasKit(definition, analytics)).toBe(definition);
  });
});

describe('business archetypes in the player', () => {
  it('runs SaaS onboarding: kit rows seeded, Get started opens the lazy onboarding wizard', {
    timeout: 120_000,
  }, async () => {
    const { runtime } = await boot(saas);
    expect((await table(runtime, 'saas_accounts')).length).toBeGreaterThan(0);
    expect((await table(runtime, 'workspaces')).length).toBeGreaterThan(0);
    const link = await screen.findByRole('link', { name: /Get started/ });
    expect(link.getAttribute('href')).toBe('#/onboarding');
    window.location.hash = '#/onboarding';
    expect(await screen.findByRole('heading', { name: /Set up your account/ })).toBeTruthy();
    expect(() => runtime.session.assert('onboarding:progress')).not.toThrow();
  });

  it('runs the analytics dashboard and persists a recorded metric across a reload', {
    timeout: 120_000,
  }, async () => {
    const { runtime, indexedDB } = await boot(analytics);
    const before = (await table(runtime, 'metrics')).length;
    const links = await screen.findAllByRole('link', { name: /Analytics/ });
    expect(links.some((link) => link.getAttribute('href') === '#/analytics')).toBe(true);
    window.location.hash = '#/analytics';
    expect(await screen.findByTestId('player-analytics-archetype')).toBeTruthy();
    expect(await screen.findByText('Events')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Events by type' }).textContent).toMatch(/Signup/);

    await fireEvent.input(screen.getByLabelText('Metric name'), {
      target: { value: 'Activation rate' },
    });
    await fireEvent.input(screen.getByLabelText('Metric value'), { target: { value: '42' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Record metric' }));
    await waitFor(async () => expect((await table(runtime, 'metrics')).length).toBe(before + 1));

    await booted?.destroy();
    booted = undefined;
    document.body.replaceChildren();
    const reopened = await boot(analytics, indexedDB);
    const metrics = await table(reopened.runtime, 'metrics');
    expect(metrics.some((row) => row.name === 'Activation rate' && row.value === 42)).toBe(true);
  });
});

describe('laziness in the built player', () => {
  it('keeps the SaaS and analytics kits out of the initial JavaScript', {
    timeout: 600_000,
  }, () => {
    ensurePlayerBuild(ROOT);
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const initial = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map(
      (match) => match[1] as string
    );
    expect(initial.length).toBeGreaterThan(0);
    const text = initial.map((file) => readFileSync(join(DIST, file), 'utf8')).join('\n');
    for (const marker of [
      'saas_accounts',
      'Record metric',
      'Set up your account',
      'Events by type',
    ]) {
      expect(text.includes(marker), marker).toBe(false);
    }
  });
});
