// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveAppModel, parseBlueprint } from '@protoyard/blueprint';
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
  it('validates each catalog layout id and the generated app applies it with grouped navigation', () => {
    for (const id of LAYOUT_IDS) {
      const input = blueprintInput({ id });
      const blueprint = parseBlueprint(input);
      const files = emitPrototype(blueprint, 'layout-example', JSON.stringify(input));
      const app = files.find((file) => file.path === 'src/App.svelte');

      // The layout is no longer emitted: BlueprintApp reads it from the blueprint's app model.
      expect(
        files.some((file) => file.path === 'src/generated/layout.ts'),
        id
      ).toBe(false);
      expect(app?.content, id).toContain('<BlueprintApp {blueprint} {themeLibrary} />');
      const model = deriveAppModel(blueprint);
      expect(model.layout, id).toEqual({ id });
      expect(model.navGroups.find((group) => group.label === 'Records')?.paths, id).toEqual([
        '/projects',
      ]);
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

  it('warns when a layout is added to a prototype whose owned app ignores it', async () => {
    const initial = writeBlueprint(blueprintInput(undefined), 'initial.json');
    expect(
      (await run('generate', 'layout-example', '--blueprint', initial, '--no-install')).code
    ).toBe(0);
    linkInstalled(workspace, 'layout-example');

    // A hand-written app that neither renders BlueprintApp nor reads a generated layout.
    const appPath = path('prototypes/layout-example/src/App.svelte');
    writeFileSync(appPath, '<main>Hand-written app</main>\n');
    const changed = writeBlueprint(blueprintInput({ id: 'top-nav' }), 'changed.json');
    const regenerated = await run(
      'generate',
      'layout-example',
      '--blueprint',
      changed,
      '--no-install'
    );

    const warning =
      'layout set; owned App.svelte does not render BlueprintApp (@protoyard/crud/app) — see GENERATOR.md';
    expect(regenerated.code, regenerated.stderr || regenerated.stdout).toBe(0);
    expect(regenerated.json<{ data: { layoutWarning: string } }>().data.layoutWarning).toBe(
      warning
    );
    expect(regenerated.stdout).toContain(warning);
  });

  it('regenerates only the blueprint for a layout change and validates the real app build', async () => {
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
    const data = regenerated.json<{
      data: { files: { path: string; status: string }[]; layoutWarning?: string };
    }>().data;
    expect(data.layoutWarning).toBeUndefined();
    expect(data.files).toContainEqual({ path: 'src/App.svelte', status: 'skipped' });
    expect(
      data.files
        .filter((file) => file.status === 'changed')
        .map((file) => file.path)
        .sort()
    ).toEqual(['blueprint.json', 'src/generated/blueprint.snapshot.json']);
    // The app reads the new layout from the regenerated blueprint.
    const saved = parseBlueprint(
      JSON.parse(readFileSync(path('prototypes/layout-example/blueprint.json'), 'utf8'))
    );
    expect(deriveAppModel(saved).layout).toEqual({ id: 'top-nav', mobile: 'mobile-tabs' });

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
