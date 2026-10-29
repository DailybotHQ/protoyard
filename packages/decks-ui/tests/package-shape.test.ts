// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The deck packages' shape (ADR-038): the engine never imports Svelte, every
 * declared entry exists, and the decks-ui root never statically reaches a
 * lazy subpath, so a deck pays for DeckApp, presenter, print and Deck Studio
 * only when it imports them.
 */

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url));
const LAZY_SUBPATHS = ['app', 'studio', 'debug'] as const;

const manifest = (name: string) =>
  JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as {
    exports: Record<string, string | Record<string, string>>;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const targets = (exportsMap: Record<string, string | Record<string, string>>) =>
  Object.values(exportsMap).flatMap((value) =>
    typeof value === 'string' ? [value] : Object.values(value)
  );

describe('deck package shape', () => {
  it('every export target of both packages exists in src', () => {
    for (const name of ['decks', 'decks-ui']) {
      for (const target of targets(manifest(name).exports)) {
        expect(existsSync(join(PACKAGES, name, target)), `${name} → ${target}`).toBe(true);
      }
    }
  });

  it('decks-ui declares one lazy subpath per host surface (the stage itself is @texuli/slides)', () => {
    const subpaths = Object.keys(manifest('decks-ui').exports);
    for (const lazy of LAZY_SUBPATHS) expect(subpaths).toContain(`./${lazy}`);
  });

  it('the engine has no Svelte dependency or import', () => {
    const engine = manifest('decks');
    expect(engine.dependencies ?? {}).not.toHaveProperty('svelte');
    expect(engine.peerDependencies ?? {}).not.toHaveProperty('svelte');
    for (const file of walk(join(PACKAGES, 'decks', 'src'))) {
      expect(file.endsWith('.svelte'), file).toBe(false);
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/from\s+['"]svelte/);
    }
  });

  it('the decks-ui root never statically imports a lazy subpath', () => {
    const root = readFileSync(join(PACKAGES, 'decks-ui', 'src', 'index.ts'), 'utf8');
    for (const lazy of LAZY_SUBPATHS) {
      expect(root).not.toMatch(new RegExp(`from\\s+['"]\\./${lazy}/`));
      expect(root).not.toContain(`@protoyard/decks-ui/${lazy}`);
    }
  });
});
