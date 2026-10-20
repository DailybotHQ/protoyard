// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Published code must reach another package through its name and `exports`,
 * never through a relative path into the sibling's folder: once installed
 * from npm, `../../blueprint/src/x.ts` points at nothing (ADR-028).
 * Tests and fixtures may reach across packages; they are never published.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGES = join(REPO, 'packages');
/** Folders of a package that ship to consumers. */
const PUBLISHED_DIRS = ['src', 'bin'];
const SOURCE_FILE = /\.(?:[cm]?[jt]s|svelte)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', '__snapshots__']);

// `from '…'` (import/export), side-effect `import '…'` and dynamic `import('…')`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*)\1/g;

export interface BoundaryViolation {
  file: string;
  specifier: string;
  target: string;
}

/** Relative specifiers in `source` that resolve outside `packageDir`. */
export function crossPackageImports(
  source: string,
  file: string,
  packageDir: string
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[2] ?? '';
    const target = resolve(dirname(file), specifier);
    const rel = relative(packageDir, target);
    if (rel === '..' || rel.startsWith(`..${sep}`)) {
      violations.push({ file, specifier, target: relative(REPO, target) });
    }
  }
  return violations;
}

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path, files);
    } else if (SOURCE_FILE.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function packageDirs(): string[] {
  return readdirSync(PACKAGES)
    .map((name) => join(PACKAGES, name))
    .filter((dir) => existsSync(join(dir, 'package.json')));
}

describe('crossPackageImports', () => {
  const pkg = join(PACKAGES, 'crud');
  const file = join(pkg, 'src', 'SearchPalette.svelte');

  it('flags static, re-export, side-effect and dynamic imports into a sibling', () => {
    const source = [
      "import { a } from '../../blueprint/src/search.ts';",
      "export { b } from '../../ui/src/index.ts';",
      "import '../../themes/src/base.css';",
      "const c = await import('../../views/src/board/index.ts');",
    ].join('\n');
    expect(crossPackageImports(source, file, pkg).map((v) => v.target)).toEqual([
      'packages/blueprint/src/search.ts',
      'packages/ui/src/index.ts',
      'packages/themes/src/base.css',
      'packages/views/src/board/index.ts',
    ]);
  });

  it('accepts relative imports that stay inside the package and package specifiers', () => {
    const source = [
      "import { x } from './format.ts';",
      "import Detail from './screens/EntityDetail.svelte';",
      "import pkg from '../package.json';",
      "import { searchEntities } from '@protoyard/blueprint/search';",
    ].join('\n');
    expect(crossPackageImports(source, file, pkg)).toEqual([]);
  });

  it('flags a path that climbs out of the package even when it re-enters a same-named folder', () => {
    const source = "import { y } from '../../crud-extra/src/y.ts';";
    expect(crossPackageImports(source, file, pkg)).toHaveLength(1);
  });
});

describe('package boundaries', () => {
  it('no published TS/JS/Svelte source imports another package by relative path', () => {
    const dirs = packageDirs();
    expect(dirs.length).toBeGreaterThan(20);
    let scanned = 0;
    const violations: BoundaryViolation[] = [];
    for (const dir of dirs) {
      for (const sub of PUBLISHED_DIRS) {
        for (const file of walk(join(dir, sub))) {
          scanned += 1;
          for (const v of crossPackageImports(readFileSync(file, 'utf8'), file, dir)) {
            violations.push({ ...v, file: relative(REPO, v.file) });
          }
        }
      }
    }
    expect(scanned).toBeGreaterThan(100);
    expect(violations).toEqual([]);
  });

  it('@protoyard/blueprint exports ./search and crud uses it', async () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGES, 'blueprint', 'package.json'), 'utf8')
    ) as { exports: Record<string, string> };
    const target = manifest.exports['./search'];
    expect(target).toBe('./src/search.ts');
    expect(existsSync(join(PACKAGES, 'blueprint', target ?? ''))).toBe(true);

    const search = await import('@protoyard/blueprint/search');
    expect(typeof search.searchEntities).toBe('function');

    const palette = readFileSync(join(PACKAGES, 'crud', 'src', 'SearchPalette.svelte'), 'utf8');
    expect(palette).toContain("from '@protoyard/blueprint/search'");
  });
});
