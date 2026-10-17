// @vitest-environment node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

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

  it('is retry-safe: re-running the same command resumes instead of failing', async () => {
    const args = [
      '--root',
      ws.root,
      '--json',
      'new',
      'again',
      '--template',
      'blank',
      '--no-install',
    ];
    expect((await cli(args)).code).toBe(0);
    const second = await cli(args);
    expect(second.code).toBe(0);
    expect(second.json<{ data: { created: boolean } }>().data.created).toBe(false);
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

  it('validates the generated manifest (e.g. a too-long name) and leaves nothing behind', async () => {
    const run = await cli([
      '--root',
      ws.root,
      'new',
      'long-name',
      '--template',
      'blank',
      '--no-install',
      '--name',
      'x'.repeat(200),
    ]);
    expect(run.code).toBe(4);
    expect(existsSync(join(ws.root, 'prototypes/long-name'))).toBe(false);
  });
});
