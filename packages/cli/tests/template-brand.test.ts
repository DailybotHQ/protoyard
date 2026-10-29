// @vitest-environment node
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Check } from '../src/commands/validate.ts';
import {
  refreshTemplateBrand,
  type TemplateBrandResult,
  watchTemplateBrand,
} from '../src/lib/template-brand.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * A deck made from the deck template keeps its brand resolved in
 * src/brand-theme.ts. Editing `brand` in src/blueprint.json must just work:
 * `dev` rewrites the module on every blueprint change, `validate` fixes a
 * stale one and says so, and a broken edit never overwrites a good module.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATE = join(REPO_ROOT, 'templates/deck');
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A copy of the deck template's src (blueprint and committed brand module). */
function deckDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'protoyard-brand-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(TEMPLATE, 'src'), join(dir, 'src'), { recursive: true });
  return dir;
}

function setBrand(dir: string, brand: unknown): void {
  const path = join(dir, 'src/blueprint.json');
  const blueprint = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, `${JSON.stringify({ ...blueprint, brand }, null, 2)}\n`);
}

const brandModule = (dir: string) => readFileSync(join(dir, 'src/brand-theme.ts'), 'utf8');

describe('refreshTemplateBrand', () => {
  it('leaves a current module alone and ignores folders without one', async () => {
    const dir = deckDir();
    expect(await refreshTemplateBrand(dir)).toEqual({ status: 'current' });
    rmSync(join(dir, 'src/brand-theme.ts'));
    expect(await refreshTemplateBrand(dir)).toEqual({ status: 'absent' });
  });

  it('rewrites the module when the brand changes (seed, library, none)', async () => {
    const dir = deckDir();
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    expect(await refreshTemplateBrand(dir, { write: false })).toEqual({
      status: 'stale',
      themeId: 'harbor',
    });
    expect(brandModule(dir)).toContain("'lumen-notes'");
    expect(await refreshTemplateBrand(dir)).toEqual({ status: 'refreshed', themeId: 'harbor' });
    expect(brandModule(dir)).toContain("export const defaultThemeId: string | null = 'harbor';");
    expect(brandModule(dir)).toContain('Generated from #0f766e.');

    setBrand(dir, { libraryTheme: 'fintech-ledger' });
    expect(await refreshTemplateBrand(dir)).toMatchObject({ themeId: 'fintech-ledger' });
    expect(brandModule(dir)).toContain('export const brandTheme: Theme | null = null;');

    const { brand: _brand, ...rest } = JSON.parse(
      readFileSync(join(dir, 'src/blueprint.json'), 'utf8')
    );
    writeFileSync(join(dir, 'src/blueprint.json'), JSON.stringify(rest));
    expect(await refreshTemplateBrand(dir)).toEqual({ status: 'refreshed', themeId: null });
    expect(brandModule(dir)).toContain('export const defaultThemeId: string | null = null;');
  });

  it('never overwrites the module with a broken edit', async () => {
    const dir = deckDir();
    const before = brandModule(dir);
    setBrand(dir, { libraryTheme: 'no-such-theme' });
    const unknown = await refreshTemplateBrand(dir);
    expect(unknown.status).toBe('invalid');
    expect(unknown).toMatchObject({ message: expect.stringMatching(/Unknown library theme/) });
    writeFileSync(join(dir, 'src/blueprint.json'), '{ "kind": "deck", ');
    expect((await refreshTemplateBrand(dir)).status).toBe('invalid');
    expect(brandModule(dir)).toBe(before);
  });
});

describe('refreshTemplateBrand never writes through a symlink', () => {
  function outsideFile(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'protoyard-brand-target-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'target.ts');
    writeFileSync(path, content);
    return path;
  }

  it('refuses a symlinked module and leaves its target untouched', async () => {
    const dir = deckDir();
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    const target = outsideFile('export const victim = true;\n');
    rmSync(join(dir, 'src/brand-theme.ts'));
    symlinkSync(target, join(dir, 'src/brand-theme.ts'));
    const result = await refreshTemplateBrand(dir);
    expect(result.status).toBe('unsafe');
    expect(readFileSync(target, 'utf8')).toBe('export const victim = true;\n');
  });

  it('refuses a dangling module symlink and never creates its target', async () => {
    const dir = deckDir();
    const target = join(mkdtempSync(join(tmpdir(), 'protoyard-brand-dangling-')), 'planted.ts');
    cleanups.push(() => rmSync(dirname(target), { recursive: true, force: true }));
    rmSync(join(dir, 'src/brand-theme.ts'));
    symlinkSync(target, join(dir, 'src/brand-theme.ts'));
    expect((await refreshTemplateBrand(dir)).status).toBe('unsafe');
    expect(existsSync(target)).toBe(false);
  });

  it('refuses a symlinked src/ folder and a symlinked blueprint', async () => {
    const dir = deckDir();
    const real = mkdtempSync(join(tmpdir(), 'protoyard-brand-src-'));
    cleanups.push(() => rmSync(real, { recursive: true, force: true }));
    cpSync(join(dir, 'src'), real, { recursive: true });
    rmSync(join(dir, 'src'), { recursive: true });
    symlinkSync(real, join(dir, 'src'));
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    const before = readFileSync(join(real, 'brand-theme.ts'), 'utf8');
    expect((await refreshTemplateBrand(dir)).status).toBe('unsafe');
    expect(readFileSync(join(real, 'brand-theme.ts'), 'utf8')).toBe(before);
    expect(watchTemplateBrand(dir, () => {})).toBeNull();

    const other = deckDir();
    const blueprint = outsideFile(readFileSync(join(other, 'src/blueprint.json'), 'utf8'));
    rmSync(join(other, 'src/blueprint.json'));
    symlinkSync(blueprint, join(other, 'src/blueprint.json'));
    expect((await refreshTemplateBrand(other)).status).toBe('unsafe');
  });
});

describe('watchTemplateBrand (protoyard dev)', () => {
  it('refreshes the module after each blueprint save, without reacting to its own write', async () => {
    const dir = deckDir();
    const results: TemplateBrandResult[] = [];
    let notify: () => void = () => {};
    const stop = watchTemplateBrand(
      dir,
      (result) => {
        results.push(result);
        notify();
      },
      { debounceMs: 20 }
    );
    expect(stop).not.toBeNull();
    cleanups.push(() => stop?.());
    const next = () => new Promise<void>((resolve) => (notify = resolve));

    let seen = next();
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    await seen;
    expect(results).toEqual([{ status: 'refreshed', themeId: 'harbor' }]);
    expect(brandModule(dir)).toContain("'harbor'");

    seen = next();
    setBrand(dir, { libraryTheme: 'fintech-ledger' });
    await seen;
    expect(results.at(-1)).toEqual({ status: 'refreshed', themeId: 'fintech-ledger' });
    // Its own writes to brand-theme.ts trigger nothing.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(results).toHaveLength(2);
  });

  it('does not watch a folder without a template brand', () => {
    const dir = deckDir();
    rmSync(join(dir, 'src/brand-theme.ts'));
    expect(watchTemplateBrand(dir, () => {})).toBeNull();
  });
});

describe('protoyard validate: brand theme', () => {
  let ws: TempWorkspace;
  afterEach(() => ws?.cleanup());

  async function scaffoldDeck(slug: string): Promise<string> {
    ws = createWorkspace();
    cpSync(TEMPLATE, join(ws.root, 'templates/deck'), {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
    });
    const created = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      slug,
      '--template',
      'deck',
      '--no-install',
    ]);
    expect(created.code).toBe(0);
    return join(ws.root, 'prototypes', slug);
  }

  async function brandCheck(
    slug: string,
    extra: string[] = [],
    env: Record<string, string> = {}
  ): Promise<Check | undefined> {
    const run = await cli(
      ['--root', ws.root, '--json', 'validate', slug, '--skip-typecheck', ...extra],
      env
    );
    return run
      .json<{ data: { checks: Check[] } }>()
      .data.checks.find((c) => c.id === 'brand-theme');
  }

  it('passes for a fresh deck, then fixes an edited brand and says so', async () => {
    const dir = await scaffoldDeck('my-deck');
    expect(await brandCheck('my-deck')).toMatchObject({ status: 'pass' });

    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    expect(await brandCheck('my-deck')).toEqual({
      id: 'brand-theme',
      label: 'Brand theme (src/brand-theme.ts follows the blueprint brand)',
      status: 'warn',
      details: ['refreshed src/brand-theme.ts from the src/blueprint.json brand (harbor)'],
    });
    expect(brandModule(dir)).toContain("export const defaultThemeId: string | null = 'harbor';");
    expect(await brandCheck('my-deck')).toMatchObject({ status: 'pass' });
  });

  it('with --check or in CI never writes: a stale module fails with the fix command', async () => {
    const dir = await scaffoldDeck('ci-deck');
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    const before = brandModule(dir);
    for (const [extra, env] of [
      [['--check'], {}],
      [[], { CI: 'true' }],
    ] as const) {
      const result = await brandCheck('ci-deck', [...extra], { ...env });
      expect(result?.status).toBe('fail');
      expect(result?.details.join(' ')).toContain('pnpm protoyard validate ci-deck');
      expect(brandModule(dir)).toBe(before);
    }
    // Locally (no CI, no --check) the same run fixes it and warns.
    expect(await brandCheck('ci-deck')).toMatchObject({ status: 'warn' });
    expect(brandModule(dir)).not.toBe(before);
    expect(await brandCheck('ci-deck', ['--check'])).toMatchObject({ status: 'pass' });
  });

  it('fails on a symlinked module and never writes through it', async () => {
    const dir = await scaffoldDeck('linked-deck');
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-brand-validate-'));
    cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
    writeFileSync(join(outside, 'target.ts'), 'keep\n');
    rmSync(join(dir, 'src/brand-theme.ts'));
    symlinkSync(join(outside, 'target.ts'), join(dir, 'src/brand-theme.ts'));
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    const result = await brandCheck('linked-deck');
    expect(result?.status).toBe('fail');
    expect(result?.details[0]).toMatch(/symlink/);
    expect(readFileSync(join(outside, 'target.ts'), 'utf8')).toBe('keep\n');
  });

  it('fails on an unknown library theme and keeps the module', async () => {
    const dir = await scaffoldDeck('bad-deck');
    const before = brandModule(dir);
    setBrand(dir, { libraryTheme: 'no-such-theme' });
    const result = await brandCheck('bad-deck');
    expect(result?.status).toBe('fail');
    expect(result?.details[0]).toMatch(/Unknown library theme "no-such-theme"/);
    expect(brandModule(dir)).toBe(before);
  });

  it('has no brand check for a prototype without a template brand', async () => {
    const dir = await scaffoldDeck('plain-deck');
    rmSync(join(dir, 'src/brand-theme.ts'));
    expect(await brandCheck('plain-deck')).toBeUndefined();
  });
});
