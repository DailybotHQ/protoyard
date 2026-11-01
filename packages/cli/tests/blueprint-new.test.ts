// @vitest-environment node
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBriefIo } from '../src/commands/blueprint.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const SALON =
  'A dog grooming salon that books appointments, tracks groomers and invoices with amount and due date.';

let ws: TempWorkspace;
let restore: (() => void) | undefined;
beforeEach(() => {
  ws = createWorkspace();
});
afterEach(() => {
  restore?.();
  restore = undefined;
  ws.cleanup();
});

const path = (rel: string) => join(ws.root, rel);
const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'blueprint', 'new', ...args]);

/** Feeds `text` as stdin; `tty` marks it as a terminal for --interactive. */
function stdin(text: string, tty = false) {
  const input = Readable.from([text]) as Readable & { isTTY?: boolean };
  if (tty) input.isTTY = true;
  const prompts = new PassThrough();
  let asked = '';
  prompts.on('data', (chunk) => {
    asked += String(chunk);
  });
  restore = setBriefIo({ stdin: input, prompts });
  return { asked: () => asked };
}

type Envelope = {
  ok: boolean;
  data: {
    file: string;
    written: boolean;
    archetype: string;
    layout: string;
    name: string;
    entities: string[];
    screens: string[];
    rationale: string[];
    blueprint?: Record<string, unknown>;
    generate?: { dryRun: boolean; files: { path: string }[] };
  };
  error?: { code: string; message: string; hint?: string };
};

describe('protoyard blueprint new', () => {
  it('never writes over workspace config, generated state, dependencies or symlinks', async () => {
    ws.write('brief.md', SALON);
    ws.write('tsconfig.base.json', '{"compilerOptions": {}}');
    ws.write('biome.json', '{}');
    ws.write('prototypes/other/protoyard.json', '{"id": "local.other"}');
    ws.write('.protoyard/registry.json', '{}');
    ws.write('node_modules/pkg/data.json', '{}');
    ws.write('prototypes/other/src/generated/blueprint.snapshot.json', '{}');
    const reserved = [
      'package.json',
      'tsconfig.base.json',
      'biome.json',
      'prototypes/other/protoyard.json',
      '.protoyard/registry.json',
      'node_modules/pkg/data.json',
      'prototypes/other/src/generated/blueprint.snapshot.json',
      'prototypes/other/tsconfig.json',
    ];
    for (const rel of reserved) {
      const before = existsSync(path(rel)) ? readFileSync(path(rel), 'utf8') : null;
      for (const extra of [['--force'], ['--force', '--dry-run']]) {
        const result = await run(path(rel), '--from-brief', path('brief.md'), ...extra);
        expect(result.code, rel).toBe(2);
        expect(result.json<Envelope>().error?.code).toBe('unsafe_path');
      }
      expect(existsSync(path(rel)) ? readFileSync(path(rel), 'utf8') : null).toBe(before);
    }

    // A symlink is refused even when it points at a blueprint inside the workspace.
    expect((await run(path('real.json'), '--from-brief', path('brief.md'))).code).toBe(0);
    symlinkSync(path('real.json'), path('link.json'));
    const linked = await run(path('link.json'), '--from-brief', path('brief.md'), '--force');
    expect(linked.code).toBe(2);
    expect(linked.json<Envelope>().error?.code).toBe('unsafe_path');
  });

  it('rejects an empty brief and a path outside the workspace', async () => {
    stdin('   ');
    expect((await run(path('empty.json'), '--from-brief', '-')).code).toBe(2);
    restore?.();
    stdin(SALON);
    const outside = await run(join(ws.root, '..', 'escape.json'), '--from-brief', '-');
    expect(outside.code).toBe(2);
    expect(outside.json<Envelope>().error?.code).toBe('unsafe_path');
  });
});
