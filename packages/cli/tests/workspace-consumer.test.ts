// @vitest-environment node
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addPrototype, addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
afterEach(() => ws?.cleanup());

function setup() {
  ws = createWorkspace();
  ws.write('package.json', {
    name: 'consumer',
    private: true,
    protoyard: { workspace: 1 },
  });
  ws.write('protoyard.workspace.json', { templates: ['templates/*'] });
  return (...args: string[]) => cli(['--root', ws.root, '--json', ...args]);
}

describe('consumer workspace configuration', () => {
  it('lists and uses workspace templates ahead of the published catalog without following links', async () => {
    const run = setup();
    addTemplate(ws, 'blank');
    ws.write('templates/blank/LOCAL_TEMPLATE.txt', 'workspace copy');
    symlinkSync(join(ws.root, 'templates/blank'), join(ws.root, 'templates/linked'));

    const listed = await run('list', '--kind', 'template');
    expect(listed.code, listed.stderr || listed.stdout).toBe(0);
    const entries = listed.json<{ data: { entries: { slug: string; path: string }[] } }>().data
      .entries;
    const localBlank = entries.filter((entry) => entry.slug === 'blank');
    expect(localBlank).toHaveLength(1);
    expect(localBlank[0]?.path).toBe('templates/blank');
    expect(entries.some((entry) => entry.slug === 'linked')).toBe(false);
    const humanList = await cli(['--root', ws.root, 'list', '--kind', 'template']);
    expect(humanList.stdout).toContain('workspace');

    const created = await run('new', 'from-local-template', '--template', 'blank', '--no-install');
    expect(created.code, created.stderr || created.stdout).toBe(0);
    expect(
      readFileSync(join(ws.root, 'prototypes/from-local-template/LOCAL_TEMPLATE.txt'), 'utf8')
    ).toBe('workspace copy');

    ws.write('protoyard.workspace.json', { templates: ['../outside/*'] });
    const unsafe = await run('list', '--kind', 'template');
    expect(unsafe.code).not.toBe(0);
    expect(unsafe.stderr || unsafe.stdout).toContain('cannot traverse outside');
  });

  it('validates all prototypes and returns one JSON result per prototype', async () => {
    const run = setup();
    for (const slug of ['one', 'two']) {
      addPrototype(ws, slug);
      ws.write(`prototypes/${slug}/package.json`, {
        name: `@prototype/${slug}`,
        private: true,
      });
    }

    const result = await run('validate', '--all', '--skip-typecheck');
    expect(result.code).not.toBe(0);
    const data = result.json<{
      data: { total: number; failed: number; results: { slug: string; ok: boolean }[] };
    }>().data;
    expect(data.total).toBe(2);
    expect(data.failed).toBe(2);
    expect(data.results.map((row) => row.slug)).toEqual(['one', 'two']);
    expect(data.results.every((row) => row.ok === false)).toBe(true);
  });

  it('lists and generates an installed catalog blueprint by id', async () => {
    const run = setup();
    const listed = await run('list', '--kind', 'blueprint');
    expect(listed.code, listed.stderr || listed.stdout).toBe(0);
    const blueprints = listed.json<{
      data: { entries: { id: string; slug: string }[] };
    }>().data.entries;
    const crm = blueprints.find((entry) => entry.slug === 'crm');
    expect(crm).toBeDefined();

    const generated = await run(
      'generate',
      'catalog-crm',
      '--blueprint',
      crm?.id ?? '',
      '--no-install'
    );
    expect(generated.code, generated.stderr || generated.stdout).toBe(0);
    expect(readFileSync(join(ws.root, 'prototypes/catalog-crm/blueprint.json'), 'utf8')).toContain(
      'Northstar CRM'
    );
  }, 30_000);
});
