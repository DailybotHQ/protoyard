// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BlueprintInput, deriveAppModel, parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import { emitPrototype } from '../src/lib/codegen/emit.ts';
import { checkHeader } from '../src/lib/codegen/header.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function emit(raw: unknown) {
  const blueprint = parseBlueprint(raw);
  const files = emitPrototype(blueprint, 'model-check', JSON.stringify(raw));
  const file = (path: string) => {
    const found = files.find((candidate) => candidate.path === path);
    if (!found) throw new Error(`codegen did not emit ${path}`);
    return found.content;
  };
  return {
    blueprint,
    files,
    routes: file('src/generated/routes.ts'),
    layout: file('src/generated/layout.ts'),
  };
}

/** Route blocks as codegen prints them: name, path and the lazy import target. */
function printedRoutes(text: string) {
  return [
    ...text.matchAll(
      /\{\n {4}name: '([^']+)',\n {4}description: .+,\n {4}path: '([^']+)',\n {4}title: .+,\n {4}load: \(\) => import\('([^']+)'\),\n {2}\},/g
    ),
  ].map(([, name, path, load]) => ({ name, path, load }));
}

const fixture: BlueprintInput = {
  formatVersion: 1,
  name: 'Model Printer',
  entities: [
    {
      name: 'site-visit',
      plural: 'site-visits',
      titleField: 'title',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'status', kind: 'enum', values: ['planned', 'done'], default: 'planned' },
        { name: 'day', kind: 'date' },
        { name: 'spot', kind: 'geo' },
      ],
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  screens: [
    { type: 'dashboard', path: '/' },
    { type: 'board', entity: 'site-visit', groupBy: 'status' },
    { type: 'calendar', entity: 'site-visit', dateField: 'day', nav: { icon: 'clock' } },
    { type: 'map', entity: 'site-visit', geoField: 'spot' },
    {
      type: 'analytics',
      entity: 'site-visit',
      dateField: 'day',
      measures: [{ aggregate: 'count' }],
    },
    { type: 'detail', entity: 'site-visit', tabs: ['overview'] },
    { type: 'settings', nav: { hidden: true } },
  ],
};

describe('codegen prints the shared app model', () => {
  it('writes one route block per model route, in order, with the right lazy import', () => {
    const { blueprint, files, routes } = emit(fixture);
    const model = deriveAppModel(blueprint);
    const printed = printedRoutes(routes);
    expect(printed.map(({ name, path }) => ({ name, path }))).toEqual(
      model.routes.map(({ name, path }) => ({ name, path }))
    );
    const emittedScreens = new Set(
      files
        .filter((file) => file.path.startsWith('src/generated/screens/'))
        .map((file) => file.path)
    );
    for (const [index, route] of model.routes.entries()) {
      const load = printed[index]?.load ?? '';
      if (route.view === 'home') expect(load).toBe('../screens/Home.svelte');
      else if (route.view === 'members') expect(load).toBe('../screens/Members.svelte');
      else {
        // Every generated import resolves to a file this same run emits.
        expect(load.startsWith('./screens/'), load).toBe(true);
        expect(emittedScreens.has(`src/generated/${load.slice(2)}`), load).toBe(true);
      }
    }
  });

  it('imports exactly the Lucide icons the model lists, with Map aliased', () => {
    const { blueprint, routes } = emit(fixture);
    const model = deriveAppModel(blueprint);
    expect(model.icons).toContain('map');
    const imported = /import \{([^}]+)\} from '@lucide\/svelte';/
      .exec(routes)![1]!
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    expect(imported).toEqual([...imported].sort());
    expect(imported).toContain('Map as MapIcon');
    expect(imported).toContain('Clock');
    expect(imported).toHaveLength(model.icons.length);
    // Long import lists wrap one per line, as Biome would.
    expect(routes).toMatch(/import \{\n {2}\w/);
    expect(routes).toContain(
      "{ path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },"
    );
    expect(routes).toContain('icon: MapIcon }');
  });

  it('prints layout and navigation groups from the model', () => {
    const { blueprint, layout } = emit({
      ...fixture,
      layout: { id: 'rail', mobile: 'mobile-tabs' },
    });
    const model = deriveAppModel(blueprint);
    expect(layout).toContain("= {\n  id: 'rail',\n  mobile: 'mobile-tabs',\n};");
    for (const group of model.navGroups) expect(layout).toContain(`label: '${group.label}'`);
    // The hidden settings screen is routed but not grouped.
    expect(layout).not.toContain("'/settings'");
  });

  it('keeps generated headers intact', () => {
    const { routes, layout } = emit(fixture);
    expect(checkHeader(routes)).toEqual({ generated: true, intact: true });
    expect(checkHeader(layout)).toEqual({ generated: true, intact: true });
  });

  it('reproduces the committed routes.ts and layout.ts of every generated prototype', () => {
    const slugs = readdirSync(join(ROOT, 'prototypes')).filter((slug) => {
      try {
        readFileSync(join(ROOT, 'prototypes', slug, 'blueprint.json'));
        return true;
      } catch {
        return false;
      }
    });
    expect(slugs.length).toBeGreaterThanOrEqual(4);
    for (const slug of slugs) {
      const dir = join(ROOT, 'prototypes', slug);
      const { routes, layout } = emit(
        JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'))
      );
      expect(routes, `${slug} routes.ts`).toBe(
        readFileSync(join(dir, 'src/generated/routes.ts'), 'utf8')
      );
      expect(layout, `${slug} layout.ts`).toBe(
        readFileSync(join(dir, 'src/generated/layout.ts'), 'utf8')
      );
    }
  });
});
