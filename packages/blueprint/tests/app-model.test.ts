// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type BlueprintInput,
  deriveAppModel,
  entityLabel,
  parseBlueprint,
  SCREEN_NAV_ICONS,
  screenHasOwnView,
} from '../src/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const catalog = readdirSync(join(ROOT, 'blueprints'))
  .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  .sort()
  .map((name) => ({
    label: `blueprints/${name}`,
    raw: readJson(join(ROOT, 'blueprints', name)),
  }));

const generatedPrototypes = readdirSync(join(ROOT, 'prototypes'))
  .filter((slug) => {
    try {
      readFileSync(join(ROOT, 'prototypes', slug, 'blueprint.json'));
      return true;
    } catch {
      return false;
    }
  })
  .sort()
  .map((slug) => ({
    label: `prototypes/${slug}`,
    raw: readJson(join(ROOT, 'prototypes', slug, 'blueprint.json')),
  }));

// --- The pinned model ---------------------------------------------------------
// Generated apps and the player both render deriveAppModel(blueprint) through
// @protoyard/crud/app. The model was proven byte-identical to what the generator
// used to print as routes.ts and layout.ts; this snapshot pins it from here on, so
// any change to routes, navigation, groups, layout or icons is a reviewed diff.

const SNAPSHOT = './__snapshots__/app-model.catalog.json';

// --- Edge cases the catalog does not exercise -------------------------------

function edgeBlueprint(screens: BlueprintInput['screens'], extra: Partial<BlueprintInput> = {}) {
  const raw: BlueprintInput = {
    formatVersion: 1,
    name: 'Edge Works',
    entities: [
      {
        name: 'work-order',
        plural: 'work-orders',
        titleField: 'title',
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'status', kind: 'enum', values: ['open', 'done'], default: 'open' },
          { name: 'due', kind: 'date' },
          { name: 'ends', kind: 'date' },
        ],
      },
      {
        name: 'site',
        plural: 'sites',
        label: 'Field sites',
        titleField: 'name',
        fields: [{ name: 'name', kind: 'text', required: true }],
      },
    ],
    roles: [{ name: 'admin', permissions: { '*': ['*'] } }],
    screens,
    ...extra,
  };
  return raw;
}

const EDGES: { label: string; raw: BlueprintInput }[] = [
  { label: 'no screens', raw: edgeBlueprint([]) },
  {
    label: 'list at root replaces home',
    raw: edgeBlueprint([{ type: 'list', entity: 'work-order', path: '/' }]),
  },
  {
    label: 'hidden, ordered and duplicate-kind screens',
    raw: edgeBlueprint([
      { type: 'board', entity: 'work-order', groupBy: 'status', nav: { order: 5 } },
      {
        type: 'board',
        entity: 'work-order',
        groupBy: 'status',
        path: '/boards/two',
        nav: { hidden: true, icon: 'zap' },
      },
      { type: 'calendar', entity: 'work-order', dateField: 'due', nav: { order: 1 } },
      { type: 'timeline', entity: 'work-order', startField: 'due', endField: 'ends' },
      { type: 'form', entity: 'work-order' },
      { type: 'settings', title: 'Preferences', nav: { label: 'Prefs', icon: 'wrench' } },
    ]),
  },
  {
    label: 'dashboards, tabbed detail on a custom path and a list',
    raw: edgeBlueprint(
      [
        { type: 'dashboard', path: '/', title: 'Ops overview' },
        { type: 'dashboard', title: 'Second board' },
        { type: 'list', entity: 'site', columns: ['name'] },
        { type: 'detail', entity: 'work-order', tabs: ['overview'] },
        { type: 'detail', entity: 'site', tabs: ['overview'], path: '/places/:id' },
      ],
      { layout: { id: 'top-nav', mobile: 'mobile-tabs' } }
    ),
  },
];

describe('deriveAppModel', () => {
  it('reads the 40 catalog blueprints', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(40);
  });

  it('keeps every catalog, generated-prototype and edge-case model pinned', async () => {
    const models = Object.fromEntries(
      [...catalog, ...generatedPrototypes, ...EDGES].map(({ label, raw }) => [
        label,
        deriveAppModel(parseBlueprint(raw)),
      ])
    );
    expect(Object.keys(models).length).toBeGreaterThanOrEqual(48);
    await expect(`${JSON.stringify(models, null, 2)}\n`).toMatchFileSnapshot(SNAPSHOT);
  });

  it.each([...catalog, ...generatedPrototypes, ...EDGES])(
    'gives $label a consistent model: unique routes, nav and groups that resolve',
    ({ raw, label }) => {
      const model = deriveAppModel(parseBlueprint(raw));
      const paths = model.routes.map((route) => route.path);
      expect(new Set(paths).size, label).toBe(paths.length);
      expect(new Set(model.routes.map((route) => route.name)).size, label).toBe(paths.length);
      for (const item of model.nav) expect(paths, `${label} nav ${item.path}`).toContain(item.path);
      for (const group of model.navGroups) {
        for (const path of group.paths) expect(paths, `${label} group ${path}`).toContain(path);
      }
      expect(paths[0], label).toBe('/');
      expect(paths.at(-1), label).toBe('/members');
    }
  );

  it('is pure: the same blueprint yields an equal model', () => {
    const blueprint = parseBlueprint(catalog[0]!.raw);
    expect(deriveAppModel(blueprint)).toEqual(deriveAppModel(blueprint));
  });

  it('describes what each route renders as data', () => {
    const blueprint = parseBlueprint(EDGES[3]!.raw);
    const model = deriveAppModel(blueprint);
    const byPath = new Map(model.routes.map((route) => [route.path, route]));

    expect(byPath.get('/')).toMatchObject({
      name: 'home',
      title: 'Ops overview',
      view: 'screen',
      screenType: 'dashboard',
      screenIndex: 0,
      component: 'Dashboard1Screen',
    });
    expect(byPath.get('/dashboard')).toMatchObject({
      view: 'screen',
      component: 'Dashboard2Screen',
    });
    expect(byPath.get('/sites')).toMatchObject({
      name: 'screen-ListSite',
      view: 'entity',
      entity: 'site',
      screenType: 'list',
      screenIndex: 2,
    });
    expect(byPath.get('/work-orders/:id')).toMatchObject({
      name: 'screen-DetailWorkOrder',
      view: 'screen',
      entity: 'work-order',
      screenType: 'detail',
    });
    // A tabbed detail on a custom path leaves the default detail route on the entity page.
    expect(byPath.get('/sites/:id')).toMatchObject({ view: 'entity', entity: 'site' });
    expect(byPath.get('/sites/:id')).not.toHaveProperty('screenIndex');
    expect(byPath.get('/places/:id')).toMatchObject({ view: 'screen', screenType: 'detail' });
    expect(model.routes.at(-1)).toMatchObject({ path: '/members', view: 'members' });
    expect(model.layout).toEqual({ id: 'top-nav', mobile: 'mobile-tabs' });
  });

  it('builds navigation rows and groups with icon ids', () => {
    const model = deriveAppModel(parseBlueprint(EDGES[2]!.raw));
    expect(model.nav.map((item) => item.path)).toEqual([
      '/',
      '/work-orders',
      '/sites',
      '/work-orders/calendar',
      '/work-orders/board',
      '/work-orders/timeline',
      '/settings',
      '/members',
    ]);
    expect(model.nav[0]).toEqual({
      path: '/',
      label: 'Home',
      icon: 'layout-dashboard',
      exact: true,
    });
    expect(model.nav.find((item) => item.path === '/settings')).toEqual({
      path: '/settings',
      label: 'Prefs',
      icon: 'wrench',
    });
    // The hidden board is routed but neither listed nor grouped.
    expect(model.routes.some((route) => route.path === '/boards/two')).toBe(true);
    expect(model.navGroups.flatMap((group) => group.paths)).not.toContain('/boards/two');
    expect(model.navGroups.map((group) => group.label)).toEqual([
      'Overview',
      'Records',
      'Views',
      'Workspace',
    ]);
    for (const icon of model.icons) expect(SCREEN_NAV_ICONS).toContain(icon);
    for (const item of model.nav) expect(model.icons).toContain(item.icon);
  });

  it('defaults the layout to the sidebar and drops empty groups', () => {
    const model = deriveAppModel(parseBlueprint(EDGES[0]!.raw));
    expect(model.layout).toEqual({ id: 'sidebar' });
    expect(model.navGroups.map((group) => group.label)).toEqual([
      'Overview',
      'Records',
      'Workspace',
    ]);
    expect(model.routes.map((route) => route.name)).toEqual([
      'home',
      'work-order-list',
      'work-order-detail',
      'site-list',
      'site-detail',
      'members',
    ]);
  });

  it('labels entities and tells which screens have their own view', () => {
    expect(entityLabel({ plural: 'support-tickets' })).toBe('Support tickets');
    expect(entityLabel({ plural: 'sites', label: 'Field sites' })).toBe('Field sites');
    const blueprint = parseBlueprint(EDGES[3]!.raw);
    expect(blueprint.screens.map(screenHasOwnView)).toEqual([true, true, false, true, true]);
  });
});

describe('fixtures', () => {
  it('finds the generated prototypes', () => {
    expect(generatedPrototypes.map(({ label }) => basename(label))).toEqual(
      expect.arrayContaining(['cadence-studio-demo', 'helpdesk-demo'])
    );
  });
});
