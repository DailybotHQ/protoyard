// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@protoyard/views` is the framework-free half of the views kit (ADR-002,
 * ADR-022): engines run in Node tests, in services and in generators, so they
 * never import Svelte or UI packages. Each engine has its own subpath, and the
 * root entry is types only.
 */
const PKG = join(import.meta.dirname, '..');
const SRC = join(PKG, 'src');
const VIEWS = [
  'board',
  'calendar',
  'timeline',
  'grid',
  'tree',
  'map',
  'editor',
  'activity',
  'notifications',
  'files',
  'settings',
  'states',
  'commands',
  'scenarios',
] as const;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|js)$/.test(name)) out.push(path);
  }
  return out;
}

export function frameworkImports(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
    const spec = match[1] ?? '';
    if (
      /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|views-ui|renderer-svelte|devtools)(\/|$)/.test(spec)
    ) {
      found.push(spec);
    }
  }
  return found;
}

describe('@protoyard/views package shape', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    exports: Record<string, string>;
    dependencies: Record<string, string>;
    sideEffects: boolean;
  };

  it('exposes a types-only root plus one subpath per view', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(
      ['.', ...VIEWS.map((view) => `./${view}`)].sort()
    );
    for (const [key, target] of Object.entries(pkg.exports)) {
      expect(existsSync(join(PKG, target)), key).toBe(true);
    }
  });

  it('keeps the root entry free of runtime exports', () => {
    const root = readFileSync(join(SRC, 'index.ts'), 'utf8');
    const runtime = root
      .split('\n')
      .filter((line) => /^export\s+(?!type\b|interface\b)/.test(line.trim()));
    expect(runtime).toEqual([]);
  });

  it('depends only on avatars (data only), core, @texuli/data and zod, and is side-effect free', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@protoyard/avatars',
      '@protoyard/core',
      '@texuli/data',
      'zod',
    ]);
    expect(pkg.sideEffects).toBe(false);
  });

  it('never imports Svelte or a UI package', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(VIEWS.length + 1);
    const offenders = files.flatMap((file) =>
      frameworkImports(readFileSync(file, 'utf8')).map((spec) => `${relative(PKG, file)} → ${spec}`)
    );
    expect(offenders).toEqual([]);
  });

  it('detects the imports it guards against', () => {
    expect(frameworkImports("import { mount } from 'svelte';")).toEqual(['svelte']);
    expect(frameworkImports("import X from './X.svelte';")).toEqual(['./X.svelte']);
    expect(frameworkImports("import { Button } from '@protoyard/ui';")).toEqual(['@protoyard/ui']);
    expect(frameworkImports("import { z } from 'zod';")).toEqual([]);
  });
});
