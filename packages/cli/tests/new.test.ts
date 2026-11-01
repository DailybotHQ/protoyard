// @vitest-environment node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addPrototype, addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  addTemplate(ws, 'blank');
});
afterEach(() => ws.cleanup());

const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

describe('protoyard new', () => {
  it('copies the template, rewrites identity files and re-indexes', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'my-crm',
      '--template',
      'blank',
      '--name',
      'My CRM',
      '--description',
      'Sales pipeline',
      '--no-install',
    ]);
    expect(run.code).toBe(0);
    const { ok, data } = run.json<{ ok: boolean; data: Record<string, unknown> }>();
    expect(ok).toBe(true);
    expect(data).toMatchObject({
      slug: 'my-crm',
      id: 'local.my-crm',
      created: true,
      indexed: true,
      path: 'prototypes/my-crm',
    });

    const manifest = JSON.parse(read('prototypes/my-crm/protoyard.json'));
    expect(manifest).toMatchObject({
      id: 'local.my-crm',
      slug: 'my-crm',
      kind: 'prototype',
      name: 'My CRM',
      description: 'Sales pipeline',
      template: 'blank',
      storage: { namespace: 'my-crm', schemaVersion: 1 },
    });
    expect(Date.parse(manifest.createdAt)).not.toBeNaN();
    expect(JSON.parse(read('prototypes/my-crm/package.json')).name).toBe('@prototype/my-crm');
    expect(read('prototypes/my-crm/README.md').split('\n')[0]).toBe('# My CRM');
    expect(existsSync(join(ws.root, 'prototypes/my-crm/src/main.ts'))).toBe(true);
    expect(existsSync(join(ws.root, 'prototypes/my-crm/node_modules'))).toBe(false);
    expect(existsSync(join(ws.root, 'prototypes/my-crm/dist'))).toBe(false);
    // The template itself is untouched.
    expect(JSON.parse(read('templates/blank/protoyard.json')).kind).toBe('template');
  });

  it('refuses existing folders, and --force only reuses an empty one', async () => {
    ws.write('prototypes/taken/keep.txt', 'mine');
    const taken = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'taken',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(taken.code).toBe(1);
    expect(taken.json<{ error: { code: string } }>().error.code).toBe('conflict');
    const forced = await cli([
      '--root',
      ws.root,
      'new',
      'taken',
      '--template',
      'blank',
      '--no-install',
      '--force',
    ]);
    expect(forced.code).toBe(1);
    expect(read('prototypes/taken/keep.txt')).toBe('mine');

    mkdirSync(join(ws.root, 'prototypes/empty-one'));
    const noForce = await cli([
      '--root',
      ws.root,
      'new',
      'empty-one',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(noForce.code).toBe(1);
    const withForce = await cli([
      '--root',
      ws.root,
      'new',
      'empty-one',
      '--template',
      'blank',
      '--no-install',
      '--force',
    ]);
    expect(withForce.code).toBe(0);
    expect(existsSync(join(ws.root, 'prototypes/empty-one/protoyard.json'))).toBe(true);
  });

  it('rejects unsafe slugs and unknown templates with distinct exit codes', async () => {
    const traversal = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      '../escape',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(traversal.code).toBe(2);
    expect(existsSync(join(ws.root, 'escape'))).toBe(false);
    const reserved = await cli([
      '--root',
      ws.root,
      'new',
      'templates',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(reserved.code).toBe(2);
    const missing = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'fine-slug',
      '--template',
      'nope',
      '--no-install',
    ]);
    expect(missing.code).toBe(3);
    expect(missing.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });
});

describe('new --from', () => {
  const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

  it('remixes an existing prototype: new id, name and storage namespace, source untouched', async () => {
    addPrototype(ws, 'source-app', {
      name: 'Source App',
      template: 'blank',
      storage: { namespace: 'source-app', schemaVersion: 1 },
    });
    ws.write('prototypes/source-app/src/main.ts', 'export {};\n');
    const before = read('prototypes/source-app/protoyard.json');
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'remix-app',
      '--from',
      'source-app',
      '--no-install',
    ]);
    expect(run.code, run.stdout).toBe(0);
    expect(run.json<{ data: Record<string, unknown> }>().data).toMatchObject({
      source: { kind: 'prototype', slug: 'source-app' },
      template: 'blank',
      id: 'local.remix-app',
    });
    expect(JSON.parse(read('prototypes/remix-app/protoyard.json'))).toMatchObject({
      id: 'local.remix-app',
      slug: 'remix-app',
      name: 'Remix App',
      template: 'blank',
      storage: { namespace: 'remix-app' },
    });
    expect(read('prototypes/remix-app/src/main.ts')).toBe('export {};\n');
    expect(read('prototypes/source-app/protoyard.json')).toBe(before);
  });

  it('refuses an existing slug, traversal, both or neither source flag', async () => {
    addPrototype(ws, 'taken-app');
    const before = read('prototypes/taken-app/protoyard.json');
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          'taken-app',
          '--from',
          'blank',
          '--no-install',
        ])
      ).code
    ).toBe(1);
    expect(read('prototypes/taken-app/protoyard.json')).toBe(before);
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          '../escape',
          '--from',
          'blank',
          '--no-install',
        ])
      ).code
    ).toBe(2);
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          'ok-app',
          '--from',
          '../../etc',
          '--no-install',
        ])
      ).code
    ).toBe(2);
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          'ok-app',
          '--from',
          'blank',
          '--template',
          'blank',
        ])
      ).code
    ).toBe(2);
    expect((await cli(['--root', ws.root, '--json', 'new', 'ok-app', '--no-install'])).code).toBe(
      2
    );
    expect(existsSync(join(ws.root, 'prototypes/ok-app'))).toBe(false);
  });
});
