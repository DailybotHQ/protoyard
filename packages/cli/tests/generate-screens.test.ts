// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveAppModel, parseBlueprint } from '@protoyard/blueprint';
import { getScreenKindMetadata } from '@protoyard/crud/registry-meta';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitPrototype } from '../src/lib/codegen/emit.ts';
import { checkHeader, withHeader } from '../src/lib/codegen/header.ts';
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

type FileStatusRow = { path: string; status: string };
const filesOf = (result: Awaited<ReturnType<typeof run>>) =>
  result.json<{ data: { files: FileStatusRow[] } }>().data.files;

describe('generated screen routes', () => {
  it('routes every declared screen through the shared app shell instead of emitted wrappers', () => {
    const blueprint = parseBlueprint(input);
    const files = emitPrototype(blueprint, 'harbor-projects', JSON.stringify(input));
    const byPath = Object.fromEntries(files.map((file) => [file.path, file.content]));

    // Nothing route-shaped is emitted: the app derives it from the blueprint (ADR-029).
    expect(Object.keys(byPath).filter((p) => p.startsWith('src/generated/screens/'))).toEqual([]);
    expect(byPath['src/generated/routes.ts']).toBeUndefined();
    expect(byPath['src/generated/layout.ts']).toBeUndefined();
    expect(byPath['src/screens/Home.svelte']).toBeUndefined();
    const app = byPath['src/App.svelte'] ?? '';
    expect(app).toContain("import('@protoyard/crud/app')");
    expect(app).toContain("import { blueprint } from './generated/blueprint.ts';");
    expect(app).toContain('<BlueprintApp {blueprint} {themeLibrary} />');
    expect(app).toContain("import('@protoyard/themes/library')");

    // The routes the app renders: the root dashboard owns `/`, the tabbed detail its record route.
    const model = deriveAppModel(blueprint);
    const byRoute = new Map(model.routes.map((route) => [route.path, route]));
    expect(byRoute.get('/')).toMatchObject({
      view: 'screen',
      screenType: 'dashboard',
      screenIndex: 6,
      component: 'Dashboard7Screen',
    });
    expect(byRoute.get('/projects/:id')).toMatchObject({ view: 'screen', screenType: 'detail' });
    expect(model.nav.find((item) => item.path === '/projects/board')?.icon).toBe('kanban');
    const screenRoutes = model.routes.filter((route) => route.view === 'screen');
    expect(screenRoutes).toHaveLength(8);
    // Every kind has a lazy kit in the screen registry the shell loads from.
    for (const route of screenRoutes) {
      if (route.view !== 'screen') continue;
      expect(getScreenKindMetadata(route.screenType).subpath, route.path).toMatch(
        /^@protoyard\/crud/
      );
    }
  });

  it('adds screens without a schema bump, retires legacy generated files and protects hand edits', async () => {
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
    expect(filesOf(added).filter((file) => file.path.startsWith('src/generated/screens/'))).toEqual(
      []
    );
    expect(
      JSON.parse(
        readFileSync(path('prototypes/harbor-desk/src/generated/blueprint.snapshot.json'), 'utf8')
      )
    ).toMatchObject({ codegenFormat: 2, schemaVersion: 1 });
    expect(readFileSync(path('prototypes/harbor-desk/README.md'), 'utf8')).toContain(
      'owns the home route'
    );

    // A prototype generated before the shared shell still has generated routes and wrappers.
    const legacy = {
      routes: 'src/generated/routes.ts',
      layout: 'src/generated/layout.ts',
      board: 'src/generated/screens/BoardProjectScreen.svelte',
      page: 'src/generated/screens/ProjectPage.svelte',
    };
    ws.write(
      `prototypes/harbor-desk/${legacy.routes}`,
      withHeader('export const routes = [];\n', 'ts')
    );
    ws.write(
      `prototypes/harbor-desk/${legacy.layout}`,
      withHeader('export const navGroups = [];\n', 'ts')
    );
    ws.write(`prototypes/harbor-desk/${legacy.page}`, withHeader('<p>page</p>\n', 'svelte'));
    ws.write(`prototypes/harbor-desk/${legacy.board}`, withHeader('<p>board</p>\n', 'svelte'));
    // A hand-written file without the header is not the generator's and stays.
    ws.write('prototypes/harbor-desk/src/generated/notes.md', 'my notes\n');
    const board = path(`prototypes/harbor-desk/${legacy.board}`);
    writeFileSync(board, `${readFileSync(board, 'utf8')}<!-- local edit -->\n`);
    expect(checkHeader(readFileSync(board, 'utf8')).intact).toBe(false);

    const blocked = await run('harbor-desk', '--blueprint', withScreens, '--no-install');
    expect(blocked.code).toBe(1);
    expect(filesOf(blocked)).toContainEqual({ path: legacy.board, status: 'conflicted' });
    expect(filesOf(blocked)).toContainEqual({ path: legacy.routes, status: 'removed' });
    expect(existsSync(path(`prototypes/harbor-desk/${legacy.routes}`))).toBe(true);

    const forced = await run('harbor-desk', '--blueprint', withScreens, '--no-install', '--force');
    expect(forced.code).toBe(0);
    for (const file of Object.values(legacy)) {
      expect(existsSync(path(`prototypes/harbor-desk/${file}`)), file).toBe(false);
    }
    expect(
      filesOf(forced)
        .filter((file) => Object.values(legacy).includes(file.path))
        .map((file) => file.status)
        .sort()
    ).toEqual(['conflicted', 'removed', 'removed', 'removed']);
    expect(readFileSync(path('prototypes/harbor-desk/src/generated/notes.md'), 'utf8')).toBe(
      'my notes\n'
    );
    expect(
      forced.json<{ data: { schemaVersion: { from: number; to: number } } }>().data.schemaVersion
    ).toEqual({ from: 1, to: 1, ops: 0 });
  }, 120_000);
});
