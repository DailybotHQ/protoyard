// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string; data?: T } };

/**
 * Gates any workspace can run (Corag G-001, Dailybot G-004): `check texuli`
 * and `sweep`, with no repository scripts.
 */
describe('consumer gates', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });
  const run = (...args: string[]) => cli(['--root', (ws as TempWorkspace).root, '--json', ...args]);

  it('check texuli passes clean prototypes and fails each adoption rule with its file', async () => {
    ws = createWorkspace();
    ws.write('package.json', { name: 'consumer', private: true, protoyard: { workspace: 1 } });
    addPrototype(ws, 'clean');
    ws.write(
      'prototypes/clean/src/App.svelte',
      `<script lang="ts">import { Button } from 'texuli';</script>\n<Button>Save</Button>\n`
    );
    const clean = await run('check', 'texuli');
    expect(clean.code, clean.stdout).toBe(0);
    expect(clean.json<Envelope<{ counts: { files: number } }>>().data.counts.files).toBeGreaterThan(
      0
    );

    addPrototype(ws, 'raw');
    ws.write(
      'prototypes/raw/src/App.svelte',
      `<script lang="ts">import { Icon } from 'texuli/icons';</script>\n<button>Save</button>\n<Icon icon="search" size={16} />\n<style>.a { color: var(--py-fg); }</style>\n`
    );
    const failed = await run('check', 'texuli');
    expect(failed.code).not.toBe(0);
    const rules = failed
      .json<Envelope<{ violations: { file: string; rule: string }[] }>>()
      .data.violations.map((v) => `${v.file}:${v.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        'prototypes/raw/src/App.svelte:raw-control',
        'prototypes/raw/src/App.svelte:icon-size',
        'prototypes/raw/src/App.svelte:py-token',
      ])
    );

    // --scope limits the run; an escaping scope is refused.
    expect((await run('check', 'texuli', '--scope', 'prototypes/clean')).code).toBe(0);
    expect((await run('check', 'texuli', '--scope', '../elsewhere')).code).not.toBe(0);
  });

  it('sweep asks for a build first', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'unbuilt');
    const result = await run('sweep', 'unbuilt');
    expect(result.code).not.toBe(0);
    expect(result.json<Envelope<unknown>>().error?.message).toMatch(/has not been built/);
  });
});
