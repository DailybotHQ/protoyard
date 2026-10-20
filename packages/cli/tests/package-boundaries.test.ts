// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Published code must reach another package through its name and `exports`,
 * never through a relative path into the sibling's folder: once installed
 * from npm, `../../blueprint/src/x.ts` points at nothing (ADR-028).
 * The same holds for stylesheets: a Tailwind `@source` or a CSS `@import`
 * into a sibling's folder breaks the same way, so a package registers its own
 * folder (`@source "./"`) and others import its stylesheet by package name.
 * Tests and fixtures may reach across packages; they are never published.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGES = join(REPO, 'packages');
/** Folders of a package that ship to consumers. */
const PUBLISHED_DIRS = ['src', 'bin'];
const SOURCE_FILE = /\.(?:[cm]?[jt]s|svelte|css)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', '__snapshots__']);

// `from '…'` (import/export), side-effect `import '…'` and dynamic `import('…')`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*)\1/g;

// Path-taking CSS at-rules: `@import`, Tailwind's `@source [not]`, `@plugin`,
// `@config` and `@reference`, with a quoted path or `url("…")`.
const CSS_REFERENCE =
  /@(?:import|source|plugin|config|reference)\s+(?:not\s+)?(?:url\(\s*)?(['"])(\.{1,2}\/[^'"]*)\1/g;
// `@import "@scope/pkg/file.css"`: a package specifier that must be exported.
const CSS_PACKAGE_IMPORT = /@import\s+(?:url\(\s*)?(['"])(@protoyard\/[^'"]+)\1/g;

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

/** Relative CSS references (comments ignored) that resolve outside `packageDir`. */
export function crossPackageCssReferences(
  css: string,
  file: string,
  packageDir: string
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  for (const match of stripCssComments(css).matchAll(CSS_REFERENCE)) {
    const specifier = match[2] ?? '';
    const target = resolve(dirname(file), specifier);
    const rel = relative(packageDir, target);
    if (rel === '..' || rel.startsWith(`..${sep}`)) {
      violations.push({ file, specifier, target: relative(REPO, target) });
    }
  }
  return violations;
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function boundaryViolations(file: string, packageDir: string): BoundaryViolation[] {
  const text = readFileSync(file, 'utf8');
  return file.endsWith('.css')
    ? crossPackageCssReferences(text, file, packageDir)
    : crossPackageImports(text, file, packageDir);
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

describe('crossPackageCssReferences', () => {
  const pkg = join(PACKAGES, 'renderer-svelte');
  const file = join(pkg, 'src', 'app.css');

  it('flags @source, @source not, @import, url() and @plugin paths into a sibling', () => {
    const css = [
      '@source "../../ui/src";',
      "@source not '../../devtools/src/legacy';",
      '@import "../../themes/src/base.css";',
      '@import url("../../ui/src/styles.css");',
      '@plugin "../../charts-ui/src/plugin.js";',
    ].join('\n');
    expect(crossPackageCssReferences(css, file, pkg).map((v) => v.target)).toEqual([
      'packages/ui/src',
      'packages/devtools/src/legacy',
      'packages/themes/src/base.css',
      'packages/ui/src/styles.css',
      'packages/charts-ui/src/plugin.js',
    ]);
  });

  it('accepts own-folder sources, package imports, inline sources and comments', () => {
    const css = [
      '@import "tailwindcss";',
      '@import "@protoyard/devtools/styles.css";',
      '@source "./";',
      '@source "../src/views";',
      '@source inline("underline");',
      '/* Old: @source "../../ui/src"; */',
    ].join('\n');
    expect(crossPackageCssReferences(css, file, pkg)).toEqual([]);
  });
});

describe('package boundaries', () => {
  it('no published TS/JS/Svelte/CSS source reaches another package by relative path', () => {
    const dirs = packageDirs();
    expect(dirs.length).toBeGreaterThan(20);
    let scanned = 0;
    const violations: BoundaryViolation[] = [];
    for (const dir of dirs) {
      for (const sub of PUBLISHED_DIRS) {
        for (const file of walk(join(dir, sub))) {
          scanned += 1;
          for (const v of boundaryViolations(file, dir)) {
            violations.push({ ...v, file: relative(REPO, v.file) });
          }
        }
      }
    }
    expect(scanned).toBeGreaterThan(100);
    expect(violations).toEqual([]);
  });

  it('every @protoyard stylesheet a package imports is in the target exports map', () => {
    const imports: string[] = [];
    for (const dir of packageDirs()) {
      for (const file of walk(join(dir, 'src')).filter((f) => f.endsWith('.css'))) {
        const css = stripCssComments(readFileSync(file, 'utf8'));
        for (const match of css.matchAll(CSS_PACKAGE_IMPORT)) imports.push(match[2] ?? '');
      }
    }
    expect(imports).toContain('@protoyard/devtools/styles.css');
    expect(imports).toContain('@protoyard/charts-ui/styles.css');
    for (const specifier of imports) {
      const [, scope, name, ...rest] = /^(@protoyard)\/([^/]+)\/(.+)$/.exec(specifier) ?? [];
      expect(scope, specifier).toBe('@protoyard');
      const manifest = JSON.parse(
        readFileSync(join(PACKAGES, name ?? '', 'package.json'), 'utf8')
      ) as { exports: Record<string, unknown> };
      const target = manifest.exports[`./${rest.join('/')}`];
      expect(typeof target, specifier).toBe('string');
      expect(existsSync(join(PACKAGES, name ?? '', String(target))), specifier).toBe(true);
    }
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
