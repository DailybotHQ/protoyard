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
});
