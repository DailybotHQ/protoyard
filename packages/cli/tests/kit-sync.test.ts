// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

describe('protoyard kit sync', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('copies component bytes into an owned folder and records stable file and tree hashes', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'source-kit');
    addPrototype(ws, 'consumer');
    ws.write('prototypes/source-kit/src/components/Button.svelte', '<button>Save</button>\n');
    ws.write('prototypes/source-kit/src/components/forms/Field.svelte', '<input />\n');

    const result = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'source-kit',
      'consumer',
    ]);
    expect(result.code).toBe(0);
    const destination = join(ws.root, 'prototypes/consumer/src/components/source-kit');
    const manifest = JSON.parse(readFileSync(join(destination, '.protoyard-kit.json'), 'utf8')) as {
      format: string;
      kit: string;
      hash: string;
      files: Record<string, string>;
    };
    expect(readFileSync(join(destination, 'Button.svelte'), 'utf8')).toBe(
      '<button>Save</button>\n'
    );
    expect(readFileSync(join(destination, 'forms/Field.svelte'), 'utf8')).toBe('<input />\n');
    expect(manifest).toMatchObject({ format: 'protoyard-kit-sync/v1', kit: 'source-kit' });
    expect(manifest.files['Button.svelte']).toBe(
      createHash('sha256').update('<button>Save</button>\n').digest('hex')
    );

    const check = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'source-kit',
      'consumer',
      '--check',
    ]);
    expect(check.code).toBe(0);
    expect(check.json<{ data: { ok: boolean; hash: string } }>().data).toMatchObject({
      ok: true,
      hash: manifest.hash,
    });
  });

  it('detects source and destination edits without writing in check mode', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'source-kit');
    addPrototype(ws, 'consumer');
    ws.write('prototypes/source-kit/src/components/Badge.svelte', '<span>Ready</span>\n');
    await cli(['--root', ws.root, 'kit', 'sync', 'source-kit', 'consumer']);

    const copied = join(ws.root, 'prototypes/consumer/src/components/source-kit/Badge.svelte');
    writeFileSync(copied, '<span>Changed locally</span>\n');
    const before = readFileSync(copied, 'utf8');
    const destinationDrift = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'source-kit',
      'consumer',
      '--check',
    ]);
    expect(destinationDrift.code).toBe(4);
    expect(
      destinationDrift.json<{
        data: { ok: boolean; differences: string[]; targetDrift: boolean };
      }>().data
    ).toMatchObject({
      ok: false,
      differences: ['Badge.svelte'],
      targetDrift: true,
    });
    expect(readFileSync(copied, 'utf8')).toBe(before);

    ws.write('prototypes/source-kit/src/components/Badge.svelte', '<span>Source changed</span>\n');
    const sourceDrift = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'source-kit',
      'consumer',
      '--check',
    ]);
    expect(sourceDrift.code).toBe(4);
    expect(sourceDrift.json<{ data: { sourceDrift: boolean } }>().data.sourceDrift).toBe(true);
  });

  it('supports the design-kit template component directory and refuses unmanaged destinations', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'consumer');
    ws.write('templates/design-kit/protoyard.json', {
      ...JSON.parse(
        readFileSync(join(process.cwd(), 'templates/design-kit/protoyard.json'), 'utf8')
      ),
    });
    ws.write(
      'templates/design-kit/src/demos/components/ButtonDemo.svelte',
      '<button>Demo</button>'
    );
    const synced = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'design-kit',
      'consumer',
    ]);
    expect(synced.code).toBe(0);
    expect(
      existsSync(join(ws.root, 'prototypes/consumer/src/components/design-kit/ButtonDemo.svelte'))
    ).toBe(true);

    addPrototype(ws, 'another-consumer');
    ws.write(
      'prototypes/another-consumer/src/components/design-kit/Custom.svelte',
      '<button>Mine</button>'
    );
    const conflict = await cli([
      '--root',
      ws.root,
      '--json',
      'kit',
      'sync',
      'design-kit',
      'another-consumer',
    ]);
    expect(conflict.code).toBe(1);
    expect(
      readFileSync(
        join(ws.root, 'prototypes/another-consumer/src/components/design-kit/Custom.svelte'),
        'utf8'
      )
    ).toBe('<button>Mine</button>');
  });

  it('rejects symlinked kit source files', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'source-kit');
    addPrototype(ws, 'consumer');
    ws.write('outside.svelte', '<button>outside</button>');
    ws.write('prototypes/source-kit/src/components/placeholder.svelte', 'remove');
    const source = join(ws.root, 'prototypes/source-kit/src/components');
    const link = join(source, 'linked.svelte');
    symlinkSync(join(ws.root, 'outside.svelte'), link);
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
