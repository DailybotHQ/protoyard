// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BLOCK_FAMILIES } from '@protoyard/blocks';
import { describe, expect, it } from 'vitest';

/**
 * `@protoyard/blocks-ui` is the Svelte half of the blocks kit (ADR-022,
 * ADR-037). Every render family is its own lazy subpath, the root entry is
 * the small dispatcher only, and nothing here may pull the app stack (crud,
 * player, database, Faker) into a deck, page or doc entry.
 */
const PKG = join(import.meta.dirname, '..');
const SRC = join(PKG, 'src');
const UI_BARREL = join(PKG, '..', 'ui', 'src', 'index.ts');

interface Condition {
  types: string;
  svelte: string;
  default: string;
}

interface Manifest {
  exports: Record<string, Condition | string>;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  publishConfig: { exports: Record<string, Condition> };
  files: string[];
  repository: { directory: string };
}

const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as Manifest;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|js|svelte)$/.test(name)) out.push(path);
  }
  return out;
}

function specifiers(text: string): string[] {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? ''
  );
}

/** Imports that would put the app stack or storage inside a block chunk. */
export function forbiddenImports(text: string): string[] {
  return specifiers(text).filter((spec) =>
    /^@protoyard\/(crud|player|database|runtime|blueprint|scenarios)(\/|$)|^dexie$|^@faker-js\//.test(
      spec
    )
  );
}

describe('@protoyard/blocks-ui package shape', () => {
  it('exposes the dispatcher root, one subpath per family and styles.css', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(
      ['.', ...BLOCK_FAMILIES.map((family) => `./${family}`), './styles.css'].sort()
    );
    for (const [key, target] of Object.entries(pkg.exports)) {
      const paths = typeof target === 'string' ? [target] : Object.values(target);
      for (const path of paths) expect(existsSync(join(PKG, path)), `${key} → ${path}`).toBe(true);
    }
  });

  it('publishes the same subpaths from dist', () => {
    expect(Object.keys(pkg.publishConfig.exports).sort()).toEqual(Object.keys(pkg.exports).sort());
    for (const family of ['.', ...BLOCK_FAMILIES.map((name) => `./${name}`)]) {
      const base = family === '.' ? './dist/index' : `./dist/${family.slice(2)}/index`;
      expect(pkg.publishConfig.exports[family], family).toEqual({
        types: `${base}.d.ts`,
        svelte: `${base}.js`,
        default: `${base}.js`,
      });
    }
    expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE']);
    expect(existsSync(join(PKG, 'README.md'))).toBe(true);
    expect(existsSync(join(PKG, 'LICENSE'))).toBe(true);
    expect(pkg.repository.directory).toBe('packages/blocks-ui');
  });

  it('takes Svelte as a peer and the blocks engine as a dependency', () => {
    expect(Object.keys(pkg.peerDependencies)).toEqual(['svelte']);
    expect(pkg.dependencies['@protoyard/blocks']).toBe('workspace:*');
    expect(pkg.dependencies['@texuli/blocks']).toMatch(/^link:/);
    expect(Object.keys(pkg.dependencies).filter((name) => /dexie|faker/.test(name))).toEqual([]);
  });

  it('keeps the root entry free of family code', () => {
    const root = readFileSync(join(SRC, 'index.ts'), 'utf8');
    const families = specifiers(root).filter((spec) =>
      BLOCK_FAMILIES.some(
        (family) =>
          spec === `./${family}` ||
          spec.startsWith(`./${family}/`) ||
          spec.startsWith(`@protoyard/blocks-ui/${family}`)
      )
    );
    expect(families).toEqual([]);
  });

  it('never imports the app stack, storage or Faker', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(BLOCK_FAMILIES.length + 1);
    const offenders = files.flatMap((file) =>
      forbiddenImports(readFileSync(file, 'utf8')).map((spec) => `${relative(PKG, file)} → ${spec}`)
    );
    expect(offenders).toEqual([]);
  });

  it('is never re-exported from the @protoyard/ui barrel', () => {
    expect(readFileSync(UI_BARREL, 'utf8')).not.toMatch(/@protoyard\/blocks/);
  });

  it('detects the imports it guards against', () => {
    expect(forbiddenImports("import { BlueprintApp } from '@protoyard/crud/app';")).toEqual([
      '@protoyard/crud/app',
    ]);
    expect(forbiddenImports("const db = await import('@protoyard/database');")).toEqual([
      '@protoyard/database',
    ]);
    expect(forbiddenImports("import Dexie from 'dexie';")).toEqual(['dexie']);
    expect(forbiddenImports("import { faker } from '@faker-js/faker';")).toEqual([
      '@faker-js/faker',
    ]);
    expect(forbiddenImports("import { Button } from '@protoyard/ui';")).toEqual([]);
    expect(forbiddenImports("import { BLOCK_TONES } from '@protoyard/blocks';")).toEqual([]);
  });
});
