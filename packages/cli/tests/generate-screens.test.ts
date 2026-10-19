// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitPrototype } from '../src/lib/codegen/emit.ts';
import { checkHeader } from '../src/lib/codegen/header.ts';
import { addCrudTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  addCrudTemplate(ws);
});
afterEach(() => ws.cleanup());

const path = (relative: string) => join(ws.root, relative);
const writeBlueprint = (value: unknown, file: string) => {
  ws.write(file, value as string | object);
  return path(file);
};
const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'generate', ...args]);

const input = {
  formatVersion: 1,
  name: 'Harbor projects',
  entities: [
    {
      name: 'project',
      plural: 'projects',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'status', kind: 'enum', values: ['queued', 'active'] },
        { name: 'startsOn', kind: 'date', required: true },
        { name: 'endsOn', kind: 'date' },
        { name: 'location', kind: 'geo' },
        { name: 'brief', kind: 'file' },
      ],
      titleField: 'title',
      features: { files: true, audit: true },
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  screens: [
    { type: 'board', entity: 'project', groupBy: 'status', nav: { icon: 'kanban', order: 1 } },
    { type: 'calendar', entity: 'project', dateField: 'startsOn', endField: 'endsOn' },
    { type: 'map', entity: 'project', geoField: 'location' },
    {
      type: 'analytics',
      entity: 'project',
      dateField: 'startsOn',
      measures: [{ label: 'Projects' }],
      dimensions: ['status'],
    },
    { type: 'timeline', entity: 'project', startField: 'startsOn', endField: 'endsOn' },
    { type: 'detail', entity: 'project', tabs: ['overview', 'activity', 'files', 'audit'] },
    {
      type: 'dashboard',
      path: '/',
      title: 'Overview',
      widgets: [{ kind: 'kpi', label: 'Projects', entity: 'project', aggregate: 'count' }],
    },
    { type: 'settings', sections: ['appearance'] },
  ],
};

describe('generated screen routes', () => {
  it('emits hash-headed lazy wrappers for every rich screen and reads specs from the app context', () => {
    const blueprint = parseBlueprint(input);
    const files = emitPrototype(blueprint, 'harbor-projects', JSON.stringify(input));
    const byPath = Object.fromEntries(files.map((file) => [file.path, file.content]));
    const routes = byPath['src/generated/routes.ts'] ?? '';
    const screens = files.filter((file) => file.path.startsWith('src/generated/screens/'));

    expect(routes).toContain("path: '/',");
    expect(routes).toContain("load: () => import('./screens/Dashboard7Screen.svelte')");
    expect(routes).not.toContain("load: () => import('../screens/Home.svelte')");
    expect(routes).toContain("path: '/projects/:id'");
    expect(routes).toContain("load: () => import('./screens/DetailProjectScreen.svelte')");
    expect(routes).toContain('icon: Kanban');
    expect(screens).toHaveLength(9); // entity page plus one wrapper for each of eight declared screens

    const wrappers = screens.filter((file) => !file.path.endsWith('ProjectPage.svelte'));
    expect(wrappers).toHaveLength(8);
    for (const file of wrappers) {
      expect(checkHeader(file.content).intact, file.path).toBe(true);
      expect(file.content).toContain("from '../../lib/context.ts'");
      expect(file.content).toContain('blueprint.screens[');
    }
    expect(byPath['src/generated/screens/SettingsScreen.svelte']).toContain(
      "from '@protoyard/themes/library'"
    );
    expect(byPath['src/generated/screens/SettingsScreen.svelte']).toContain(
      'THEME_LIBRARY_META.map(({ id, name }) => ({ id, name }))'
    );
    expect(byPath['src/generated/screens/DetailProjectScreen.svelte']).toContain('EntityDetail');
    expect(byPath['src/generated/screens/Dashboard7Screen.svelte']).toContain(
      'blueprint.screens[6]'
    );
  });

  it('adds and removes screen wrappers without a schema bump and protects hand edits', async () => {
    const baseBlueprint = { ...input, name: 'Harbor desk', screens: [] };
    const initial = writeBlueprint(baseBlueprint, 'initial.json');
    expect((await run('harbor-desk', '--blueprint', initial, '--no-install')).code).toBe(0);

    const withScreens = writeBlueprint(input, 'screens.json');
    const added = await run('harbor-desk', '--blueprint', withScreens, '--no-install');
    expect(added.code).toBe(0);
    expect(
      added.json<{ data: { schemaVersion: { from: number; to: number; ops: number } } }>().data
        .schemaVersion
    ).toEqual({ from: 1, to: 1, ops: 0 });
    expect(readFileSync(path('prototypes/harbor-desk/src/generated/routes.ts'), 'utf8')).toContain(
      "load: () => import('./screens/Dashboard7Screen.svelte')"
    );
    const wrapperPaths = [
      'BoardProjectScreen.svelte',
      'CalendarProjectScreen.svelte',
      'MapProjectScreen.svelte',
      'AnalyticsProjectScreen.svelte',
      'TimelineProjectScreen.svelte',
      'DetailProjectScreen.svelte',
      'Dashboard7Screen.svelte',
      'SettingsScreen.svelte',
    ].map((name) => `src/generated/screens/${name}`);
    for (const wrapperPath of wrapperPaths)
      expect(
        added.json<{ data: { files: { path: string; status: string }[] } }>().data.files
      ).toContainEqual({
        path: wrapperPath,
        status: 'created',
      });
    expect(
      JSON.parse(
        readFileSync(path('prototypes/harbor-desk/src/generated/blueprint.snapshot.json'), 'utf8')
      )
    ).toMatchObject({ codegenFormat: 2, schemaVersion: 1 });
    expect(readFileSync(path('prototypes/harbor-desk/README.md'), 'utf8')).toContain(
      'owns the home route'
    );

    const changedScreens = writeBlueprint(
      {
        ...input,
        screens: input.screens.map((screen, index) => ({ ...screen, title: `Updated ${index}` })),
      },
      'changed-screens.json'
    );
    const board = path('prototypes/harbor-desk/src/generated/screens/BoardProjectScreen.svelte');
    const changed = await run('harbor-desk', '--blueprint', changedScreens, '--no-install');
    expect(changed.code).toBe(0);
    expect(
      changed.json<{ data: { files: { path: string; status: string }[] } }>().data.files
    ).toContainEqual({ path: 'src/generated/routes.ts', status: 'changed' });
    for (const wrapperPath of wrapperPaths)
      expect(
        changed.json<{ data: { files: { path: string; status: string }[] } }>().data.files
      ).toContainEqual({
        path: wrapperPath,
        status: 'unchanged',
      });
    writeFileSync(board, `${readFileSync(board, 'utf8')}\n<!-- local edit -->\n`);
    const removedScreens = writeBlueprint(baseBlueprint, 'removed-screens.json');
    const blocked = await run('harbor-desk', '--blueprint', removedScreens, '--no-install');
    expect(blocked.code).toBe(1);
    expect(
      blocked.json<{ data: { files: { path: string; status: string }[] } }>().data.files
    ).toContainEqual({
      path: 'src/generated/screens/BoardProjectScreen.svelte',
      status: 'conflicted',
    });

    const forced = await run(
      'harbor-desk',
      '--blueprint',
      removedScreens,
      '--no-install',
      '--force'
    );
    expect(forced.code).toBe(0);
    expect(existsSync(board)).toBe(false);
    expect(
      forced
        .json<{ data: { files: { path: string; status: string }[] } }>()
        .data.files.filter((file) => wrapperPaths.includes(file.path))
    ).toHaveLength(8);
    expect(
      forced.json<{ data: { schemaVersion: { from: number; to: number } } }>().data.schemaVersion
    ).toEqual({ from: 1, to: 1, ops: 0 });
  }, 120_000);
});
