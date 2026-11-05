// @vitest-environment node
import { mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

describe('protoyard kit sync', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('refuses a destination whose components folder links outside the workspace', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'source-kit');
    addPrototype(ws, 'consumer');
    ws.write('prototypes/source-kit/src/components/Badge.svelte', '<span>Kit</span>\n');
    const outside = join(ws.root, '..', `outside-${Date.now()}`);
    mkdirSync(outside, { recursive: true });
    mkdirSync(join(ws.root, 'prototypes/consumer/src'), { recursive: true });
    symlinkSync(outside, join(ws.root, 'prototypes/consumer/src/components'));
    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'source-kit',
      'consumer',
    ]);
    expect(result.code).toBe(2);
    expect(result.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');
    expect(readdirSync(outside)).toEqual([]);
    rmSync(outside, { recursive: true, force: true });
  });

  it('refuses relative imports that escape the copied component tree', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'source-kit');
    addPrototype(ws, 'consumer');
    ws.write(
      'prototypes/source-kit/src/components/Button.svelte',
      "<script>import '../theme.css';</script>\n<button>Save</button>"
    );
    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'source-kit',
      'consumer',
    ]);
    expect(result.code).toBe(4);
    expect(result.json<{ error: { message: string } }>().error.message).toContain(
      'escapes the synced component tree'
    );
  });

  it('syncs a kit folder outside src/components with --from (Corag UG-19)', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'brand-kit');
    addPrototype(ws, 'consumer');
    ws.write('prototypes/brand-kit/src/components/Badge.svelte', '<span>Kit</span>\n');
    ws.write(
      'prototypes/brand-kit/public/icons/logo.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n'
    );
    const args = ['--root', ws.root, '--json', 'kit', 'sync', 'brand-kit', 'consumer'];
    const synced = await cli([...args, '--from', 'public/icons']);
    expect(synced.code).toBe(0);
    expect(synced.json<{ data: { target: string } }>().data.target).toBe(
      'prototypes/consumer/public/icons/brand-kit'
    );
    expect(readdirSync(join(ws.root, 'prototypes/consumer/public/icons/brand-kit'))).toContain(
      'logo.svg'
    );
    const check = await cli([...args, '--from', 'public/icons', '--check']);
    expect(check.code).toBe(0);

    for (const from of ['../consumer/src', 'package.json', 'src', '/etc']) {
      const refused = await cli([...args, '--from', from]);
      expect(refused.code, from).not.toBe(0);
      expect(refused.json<{ error: { code: string } }>().error.code, from).toBe('unsafe_path');
    }
  });
});
