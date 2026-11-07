// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prebuiltPlayerApp, showcaseTemplatesDefault } from '../src/commands/showcase.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };

/**
 * The gallery and showcase in a consumer workspace (Dailybot G-010/G-011,
 * Corag G-004): `gallery build`/`gallery preview`, and a player installed
 * from npm (its build, no source) is copied instead of rebuilt.
 */
describe('gallery build and preview', () => {
  let ws: TempWorkspace | undefined;
  const dirs: string[] = [];
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const run = (...args: string[]) => cli(['--root', (ws as TempWorkspace).root, '--json', ...args]);

  it('uses a published player build and rebuilds only from source', () => {
    const published = mkdtempSync(join(tmpdir(), 'player-npm-'));
    dirs.push(published);
    mkdirSync(join(published, 'dist', 'app'), { recursive: true });
    writeFileSync(join(published, 'dist', 'app', 'index.html'), '<!doctype html>');
    expect(prebuiltPlayerApp(published)).toBe(join(published, 'dist', 'app'));

    const source = mkdtempSync(join(tmpdir(), 'player-src-'));
    dirs.push(source);
    mkdirSync(join(source, 'src'), { recursive: true });
    mkdirSync(join(source, 'dist', 'app'), { recursive: true });
    writeFileSync(join(source, 'dist', 'app', 'index.html'), '<!doctype html>');
    expect(prebuiltPlayerApp(source)).toBeNull();
  });

  it('previews only a built gallery, and refuses a bad base or an escaping --out', async () => {
    ws = createWorkspace();
    const unbuilt = await run('gallery', 'preview');
    expect(unbuilt.code).not.toBe(0);
    expect(unbuilt.json<Envelope<unknown>>().error?.message).toMatch(/not been built/);
    expect((await run('gallery', 'build', '--base', 'no-slash')).code).toBe(2);
    expect((await run('gallery', 'build', '--out', '../outside')).code).not.toBe(0);
  });

  it('never empties the workspace or its sources through --out (final review, PLAN_010)', async () => {
    ws = createWorkspace();
    for (const out of ['.', 'prototypes', 'templates', 'artifacts']) {
      const result = await run('gallery', 'build', '--out', out);
      expect(result.code).not.toBe(0);
      expect(result.json<Envelope<unknown>>().error?.message).toMatch(/Refusing --out/);
    }
    expect(existsSync(join(ws.root, 'prototypes'))).toBe(true);
  });

  it('reads the showcase templates default from protoyard.workspace.json, flags first', () => {
    ws = createWorkspace();
    expect(showcaseTemplatesDefault(ws.root, undefined)).toBe(true);
    ws.write('protoyard.workspace.json', { showcase: { templates: false } });
    expect(showcaseTemplatesDefault(ws.root, undefined)).toBe(false);
    expect(showcaseTemplatesDefault(ws.root, true)).toBe(true);
    ws.write('protoyard.workspace.json', { showcase: { templates: 'no' } });
    expect(showcaseTemplatesDefault(ws.root, undefined)).toBe(true);
    expect(showcaseTemplatesDefault(ws.root, false)).toBe(false);
  });
});
