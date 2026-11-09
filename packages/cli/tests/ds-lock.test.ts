// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentHash } from '../src/lib/design-systems.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const PROTOTYPE = `import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
});
`;

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };

describe('ds use --lock and --upgrade (PLAN_013 T-lock)', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });
  const run = (...args: string[]) =>
    cli(['--root', (ws as TempWorkspace).root, '--json', 'ds', ...args]);
  const json = (path: string) =>
    JSON.parse(readFileSync(join((ws as TempWorkspace).root, path), 'utf8')) as Record<
      string,
      unknown
    >;

  function prototype(slug: string) {
    addPrototype(ws as TempWorkspace, slug);
    ws?.write(`prototypes/${slug}/src/prototype.ts`, PROTOTYPE);
    ws?.write(`prototypes/${slug}/package.json`, {
      name: slug,
      private: true,
      devDependencies: { '@protoyard/runtime': 'workspace:*' },
    });
  }

  /** What `ds approve` will write (T-kit); the CLI cannot prove who approved. */
  function approve(id: string, by = 'Ada Example') {
    const document = json(`design-systems/${id}/document.json`);
    ws?.write(`design-systems/${id}/approval.json`, {
      status: 'approved',
      version: document.version,
      approvedBy: by,
      approvedAt: '2026-11-09T12:00:00.000Z',
      contentHash: contentHash(document),
    });
  }

  it('refuses to lock a flat document or a draft, and locks an approved one at its exact version', async () => {
    ws = createWorkspace();
    prototype('locked-app');
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    expect(
      (await run('new', 'flat-ds', '--brand', '#334155', '--out', 'design-systems/flat-ds.json'))
        .code
    ).toBe(0);

    const flat = await run('use', 'locked-app', 'flat-ds', '--lock');
    expect(flat.code).not.toBe(0);
    expect(flat.stdout).toContain('ds migrate');

    const draft = await run('use', 'locked-app', 'harbor', '--lock');
    expect(draft.code).not.toBe(0);
    expect(draft.stdout).toContain('is a draft');
    expect(json('prototypes/locked-app/protoyard.json').designSystem).toBeUndefined();

    approve('harbor');
    const version = json('design-systems/harbor/document.json').version as string;
    const locked = await run('use', 'locked-app', 'harbor', '--lock');
    expect(locked.code, locked.stdout).toBe(0);
    expect(json('prototypes/locked-app/protoyard.json').designSystem).toEqual({
      id: 'harbor',
      version,
      locked: true,
    });
    expect(json('prototypes/locked-app/protoyard.json').defaultTheme).toBe('harbor');

    // Re-applying the same version keeps the lock without --lock.
    const again = await run('use', 'locked-app', 'harbor');
    expect(again.code, again.stdout).toBe(0);
    expect(json('prototypes/locked-app/protoyard.json').designSystem).toMatchObject({
      locked: true,
    });
  });

  it('refuses a document changed after approval, another design system, and an unasked version move', async () => {
    ws = createWorkspace();
    prototype('locked-app');
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    expect((await run('new', 'dusk', '--brand', '#7c3aed')).code).toBe(0);
    approve('harbor');
    approve('dusk');
    expect((await run('use', 'locked-app', 'harbor', '--lock')).code).toBe(0);

    const other = await run('use', 'locked-app', 'dusk', '--force');
    expect(other.code).not.toBe(0);
    expect(other.stdout).toContain('is locked to design system');

    // Edit the document after approval: same version, different content.
    const document = json('design-systems/harbor/document.json');
    ws.write('design-systems/harbor/document.json', {
      ...document,
      description: 'Changed after review.',
    });
    const tampered = await run('use', 'locked-app', 'harbor');
    expect(tampered.code).not.toBe(0);
    expect(tampered.stdout).toContain('changed after it was approved');

    // A new version, approved: needs --upgrade, which lists the changes.
    ws.write('design-systems/harbor/document.json', {
      ...document,
      version: '9.9.9',
      description: 'A reviewed update.',
    });
    approve('harbor');
    const pinned = await run('use', 'locked-app', 'harbor');
    expect(pinned.code).not.toBe(0);
    expect(pinned.stdout).toContain('--upgrade');
    const upgraded = await run('use', 'locked-app', 'harbor', '--upgrade');
    expect(upgraded.code, upgraded.stdout).toBe(0);
    const data =
      upgraded.json<
        Envelope<{ designSystem: { version: string }; changes: { changed: string[] } }>
      >().data;
    expect(data.designSystem.version).toBe('9.9.9');
    expect(data.changes.changed).toEqual(expect.arrayContaining(['version']));
    expect(json('prototypes/locked-app/protoyard.json').designSystem).toEqual({
      id: 'harbor',
      version: '9.9.9',
      locked: true,
    });
  });

  it('--upgrade needs a binding, and an unbound prototype stays unbound without --lock', async () => {
    ws = createWorkspace();
    prototype('free-app');
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    const upgrade = await run('use', 'free-app', 'harbor', '--upgrade');
    expect(upgrade.code).not.toBe(0);
    expect(upgrade.stdout).toContain('not bound');
    const used = await run('use', 'free-app', 'harbor');
    expect(used.code, used.stdout).toBe(0);
    expect(json('prototypes/free-app/protoyard.json').designSystem).toBeUndefined();
  });
});
