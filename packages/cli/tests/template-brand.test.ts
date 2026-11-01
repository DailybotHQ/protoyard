// @vitest-environment node
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshTemplateBrand } from '../src/lib/template-brand.ts';

/**
 * A deck made from the deck template keeps its brand resolved in
 * src/brand-theme.ts. Editing `brand` in src/blueprint.json must just work:
 * `dev` rewrites the module on every blueprint change, `validate` fixes a
 * stale one and says so, and a broken edit never overwrites a good module.
 */
/** Runs once when the module is read, between the safety check and the write (a swap window). */
const onModuleRead = vi.hoisted(() => ({
  hook: null as null | ((path: string) => void),
  /** Reads of src/blueprint.json: each refresh starts with one. */
  blueprintReads: 0,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = (async (path: unknown, ...rest: unknown[]) => {
    if (String(path).endsWith('blueprint.json')) onModuleRead.blueprintReads += 1;
    const result = await (actual.readFile as (...args: unknown[]) => Promise<unknown>)(
      path,
      ...rest
    );
    if (String(path).endsWith('brand-theme.ts') && onModuleRead.hook) {
      const hook = onModuleRead.hook;
      onModuleRead.hook = null;
      hook(String(path));
    }
    return result;
  }) as typeof actual.readFile;
  return { ...actual, readFile, default: { ...actual, readFile } };
});

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

  it('refuses a module swapped for a symlink after the first check', async () => {
    const dir = deckDir();
    setBrand(dir, { name: 'Harbor', seed: '#0f766e' });
    const target = outsideFile('export const victim = true;\n');
    onModuleRead.hook = (path) => {
      rmSync(path);
      symlinkSync(target, path);
    };
    expect((await refreshTemplateBrand(dir)).status).toBe('unsafe');
    expect(readFileSync(target, 'utf8')).toBe('export const victim = true;\n');
  });
});
