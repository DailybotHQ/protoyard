// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@protoyard/blocks` is the framework-free half of the blocks kit (ADR-022,
 * ADR-037): schemas and engines run in Node tests, in the blueprint union, in
 * the CLI and in kind runtimes, so the package never imports Svelte or a UI
 * package. Heavier engines live behind their own subpaths.
 */
const PKG = join(import.meta.dirname, '..');
const SRC = join(PKG, 'src');
const SUBPATHS = ['formula', 'interactive', 'code', 'diagram', 'catalog'] as const;

interface Manifest {
  exports: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  sideEffects: boolean;
  files: string[];
  publishConfig: { exports: Record<string, { types: string; import: string }> };
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

export function frameworkImports(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
    const spec = match[1] ?? '';
    if (
      /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|blocks-ui|views-ui|charts-ui|ai-ui|renderer-svelte|devtools|crud|player|database|blueprint)(\/|$)|^dexie$/.test(
        spec
      )
    ) {
      found.push(spec);
    }
  }
  return found;
}

describe('@protoyard/blocks package shape', () => {
  it('exposes the root plus one subpath per engine, and every target exists', () => {
    // `./schema` serves the generated JSON Schema module (T-blocks-json-schema) for agents and editors.
    expect(Object.keys(pkg.exports).sort()).toEqual(
      ['.', './schema', ...SUBPATHS.map((name) => `./${name}`)].sort()
    );
    for (const [key, target] of Object.entries(pkg.exports)) {
      expect(existsSync(join(PKG, target)), key).toBe(true);
    }
  });

  it('publishes the same subpaths from dist with types', () => {
    expect(Object.keys(pkg.publishConfig.exports).sort()).toEqual(Object.keys(pkg.exports).sort());
    for (const [key, target] of Object.entries(pkg.exports)) {
      const published = pkg.publishConfig.exports[key];
      const base = target.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '');
      expect(published, key).toEqual({
        types: `${base}.d.ts`,
        import: `${base}.js`,
        default: `${base}.js`,
      });
    }
  });

  it('depends only on ai, avatars, core and zod, has no Svelte, and is side-effect free', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@protoyard/ai',
      '@protoyard/avatars',
      '@protoyard/core',
      'zod',
    ]);
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    expect(Object.keys(all).filter((name) => /svelte/.test(name))).toEqual([]);
    expect(pkg.sideEffects).toBe(false);
  });

  it('packs dist, README and LICENSE from its own directory', () => {
    // `schema/` ships the committed blocks.schema.json next to dist.
    expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE', 'schema']);
    expect(existsSync(join(PKG, 'README.md'))).toBe(true);
    expect(existsSync(join(PKG, 'LICENSE'))).toBe(true);
    expect(pkg.repository.directory).toBe('packages/blocks');
  });

  it('never imports Svelte, a UI package, the database or the blueprint', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(SUBPATHS.length + 1);
    const offenders = files.flatMap((file) =>
      frameworkImports(readFileSync(file, 'utf8')).map((spec) => `${relative(PKG, file)} → ${spec}`)
    );
    expect(offenders).toEqual([]);
  });

  it('detects the imports it guards against', () => {
    expect(frameworkImports("import { mount } from 'svelte';")).toEqual(['svelte']);
    expect(frameworkImports("import X from './X.svelte';")).toEqual(['./X.svelte']);
    expect(frameworkImports("import { Button } from '@protoyard/ui';")).toEqual(['@protoyard/ui']);
    expect(frameworkImports("const m = import('@protoyard/blocks-ui/text');")).toEqual([
      '@protoyard/blocks-ui/text',
    ]);
    // blueprint will import blocks; the reverse edge would be a cycle.
    expect(frameworkImports("import type { Blueprint } from '@protoyard/blueprint';")).toEqual([
      '@protoyard/blueprint',
    ]);
    expect(frameworkImports("import Dexie from 'dexie';")).toEqual(['dexie']);
    expect(frameworkImports("import { z } from 'zod';")).toEqual([]);
    expect(frameworkImports("import { parseMarkdown } from '@protoyard/ai/markdown';")).toEqual([]);
  });
});
