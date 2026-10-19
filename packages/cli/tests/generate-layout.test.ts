// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBlueprint } from '@protoyard/blueprint';
import { LAYOUT_IDS } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitPrototype } from '../src/lib/codegen/emit.ts';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  linkInstalled,
  type TempWorkspace,
} from './helpers.ts';

let workspace: TempWorkspace;
beforeEach(() => {
  workspace = createWorkspace();
  addCrudTemplate(workspace);
});
afterEach(() => workspace.cleanup());

const path = (relative: string) => join(workspace.root, relative);
const writeBlueprint = (value: unknown, file: string) => {
  workspace.write(file, value as string | object);
  return path(file);
};
const run = (...args: string[]) => cli(['--root', workspace.root, '--json', ...args]);

const blueprintInput = (layout?: { id: string; mobile?: string }) => ({
  formatVersion: 1,
  name: 'Layout example',
  entities: [
    {
      name: 'project',
      plural: 'projects',
      fields: [{ name: 'name', kind: 'text', required: true }],
      titleField: 'name',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  ...(layout ? { layout } : {}),
  screens: [
    { type: 'list', entity: 'project', path: '/projects', nav: { label: 'Projects' } },
    { type: 'dashboard', path: '/', title: 'Overview' },
    { type: 'settings', path: '/settings', sections: ['appearance'] },
  ],
});

describe('generated layouts', () => {
  it('validates each catalog layout id and emits the selected id plus grouped navigation', () => {
    for (const id of LAYOUT_IDS) {
      const input = blueprintInput({ id });
      const blueprint = parseBlueprint(input);
      const files = emitPrototype(blueprint, 'layout-example', JSON.stringify(input));
      const generatedLayout = files.find((file) => file.path === 'src/generated/layout.ts');
      const app = files.find((file) => file.path === 'src/App.svelte');

      expect(generatedLayout?.generated, id).toBe(true);
      expect(generatedLayout?.content, id).toContain(`id: '${id}'`);
      expect(generatedLayout?.content, id).toContain("label: 'Records'");
      expect(generatedLayout?.content, id).toContain("paths: ['/projects']");
      expect(app?.content, id).toContain("from './generated/layout.ts'");
      expect(app?.content, id).toContain('<LayoutHost layout={activeLayout}');
    }
  });

  it('validates an optional mobile layout and rejects unknown layout ids', () => {
    expect(parseBlueprint(blueprintInput({ id: 'sidebar', mobile: 'mobile-tabs' })).layout).toEqual(
      {
        id: 'sidebar',
        mobile: 'mobile-tabs',
      }
    );
    expect(() => parseBlueprint(blueprintInput({ id: 'sideways' }))).toThrow();
    expect(() => parseBlueprint(blueprintInput({ id: 'sidebar', mobile: 'phone-tabs' }))).toThrow();
  });

  it('warns when a layout is added to a legacy prototype whose owned app ignores it', async () => {
    const initial = writeBlueprint(blueprintInput(undefined), 'initial.json');
    expect(
      (await run('generate', 'layout-example', '--blueprint', initial, '--no-install')).code
    ).toBe(0);
    linkInstalled(workspace, 'layout-example');

    const appPath = path('prototypes/layout-example/src/App.svelte');
    const legacyApp = readFileSync(appPath, 'utf8').replace(
      "import { layout, navGroups } from './generated/layout.ts';\n",
      ''
    );
    writeFileSync(appPath, legacyApp);
    const changed = writeBlueprint(blueprintInput({ id: 'top-nav' }), 'changed.json');
    const regenerated = await run(
      'generate',
      'layout-example',
      '--blueprint',
      changed,
      '--no-install'
    );

    expect(regenerated.code, regenerated.stderr || regenerated.stdout).toBe(0);
    expect(regenerated.json<{ data: { layoutWarning: string } }>().data.layoutWarning).toBe(
      'layout set; owned App.svelte does not read src/generated/layout.ts — see GENERATOR.md'
    );
    expect(regenerated.stdout).toContain(
      'layout set; owned App.svelte does not read src/generated/layout.ts — see GENERATOR.md'
    );
  });

  it('regenerates only the layout module for a layout change and validates the real app build', async () => {
    const initial = writeBlueprint(
      blueprintInput({ id: 'sidebar', mobile: 'mobile-tabs' }),
      'initial.json'
    );
    expect(
      (await run('generate', 'layout-example', '--blueprint', initial, '--no-install')).code
    ).toBe(0);
    linkInstalled(workspace, 'layout-example');

    const changed = writeBlueprint(
      blueprintInput({ id: 'top-nav', mobile: 'mobile-tabs' }),
      'changed.json'
    );
    const regenerated = await run(
      'generate',
      'layout-example',
      '--blueprint',
      changed,
      '--no-install'
    );
    expect(regenerated.code, regenerated.stderr || regenerated.stdout).toBe(0);
    const files = regenerated.json<{ data: { files: { path: string; status: string }[] } }>().data
      .files;
    expect(files).toContainEqual({ path: 'src/generated/layout.ts', status: 'changed' });
    expect(files).toContainEqual({ path: 'src/App.svelte', status: 'skipped' });
    expect(
      files
        .filter((file) => file.status === 'changed')
        .map((file) => file.path)
        .sort()
    ).toEqual([
      'blueprint.json',
      'src/generated/blueprint.snapshot.json',
      'src/generated/layout.ts',
    ]);
    expect(
      readFileSync(path('prototypes/layout-example/src/generated/layout.ts'), 'utf8')
    ).toContain("id: 'top-nav'");

    const validation = await run('validate', 'layout-example', '--strict-spec', '--build');
    expect(validation.code, validation.stderr || validation.stdout).toBe(0);
    expect(
      validation.json<{ data: { checks: { id: string; status: string }[] } }>().data.checks
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'build', status: 'pass' }),
        expect.objectContaining({ id: 'spec', status: 'pass' }),
      ])
    );
  }, 120_000);
});
