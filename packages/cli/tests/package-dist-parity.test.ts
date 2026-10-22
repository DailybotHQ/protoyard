// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPackageGraph, selectPackageNames } from '../../../scripts/lib/package-graph.ts';

/**
 * Svelte packages ship dist/ built by svelte-package (`pnpm build:packages
 * --filter svelte`, ADR-028). Every subpath the source `exports` map names must
 * have its dist counterpart, and dist must be self-consistent: no import still
 * ends in `.ts`, every relative import resolves inside the package's dist, and
 * every entry has declarations.
 *
 * The dist checks need a build first; without one they are skipped and named
 * so (the gate runs `pnpm build:packages --filter svelte` before this file).
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const SVELTE_PACKAGES = [
  'ui',
  'devtools',
  'renderer-svelte',
  'crud',
  'charts-ui',
  'analytics-ui',
  'views-ui',
  'blocks-ui',
  'review-ui',
  'saas-ui',
  'ai-ui',
  'flows-ui',
  'gamification-ui',
] as const;

/** `./src/a/b.ts` → `./dist/a/b.js`; `.svelte`, `.css`, `.d.ts` and data keep their name. */
export function distPathFor(sourcePath: string): string {
  if (!sourcePath.startsWith('./src/')) {
    throw new Error(`Export target outside src/: ${sourcePath}`);
  }
  const rest = sourcePath.slice('./src/'.length);
  if (/\.d\.[cm]?ts$/.test(rest)) return `./dist/${rest}`;
  return `./dist/${rest.replace(/\.([cm]?)ts$/, '.$1js')}`;
}

/** The declaration file a dist JS or Svelte entry is typed by. */
export function declarationFor(distPath: string): string | null {
  if (distPath.endsWith('.svelte')) return `${distPath}.d.ts`;
  if (/\.[cm]?js$/.test(distPath)) return distPath.replace(/\.([cm]?)js$/, '.d.$1ts');
  return null;
}

/** Every file path an `exports` map points at (all conditions), with its subpath. */
export function exportTargets(exportsMap: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  const walk = (subpath: string, value: unknown) => {
    if (typeof value === 'string') out.push([subpath, value]);
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) walk(subpath, nested);
    }
  };
  for (const [subpath, value] of Object.entries(exportsMap)) walk(subpath, value);
  return out;
}

// Static `from '…'`, side-effect `import '…'` and dynamic `import('…')`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*)\1/g;

/** Relative specifiers in emitted JS or a Svelte component's script. */
export function relativeSpecifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER)].map((m) => m[2] ?? '');
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function manifest(pkg: string): { name: string; exports: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(REPO, 'packages', pkg, 'package.json'), 'utf8'));
}

describe('dist path mapping', () => {
  it('maps source export targets to their emitted files', () => {
    expect(distPathFor('./src/index.ts')).toBe('./dist/index.js');
    expect(distPathFor('./src/board/index.ts')).toBe('./dist/board/index.js');
    expect(distPathFor('./src/state.svelte.ts')).toBe('./dist/state.svelte.js');
    expect(distPathFor('./src/Button.svelte')).toBe('./dist/Button.svelte');
    expect(distPathFor('./src/styles.css')).toBe('./dist/styles.css');
    expect(distPathFor('./src/env.d.ts')).toBe('./dist/env.d.ts');
    expect(distPathFor('./src/x.mts')).toBe('./dist/x.mjs');
    expect(() => distPathFor('./assets/a.webp')).toThrow(/outside src/);
    expect(declarationFor('./dist/index.js')).toBe('./dist/index.d.ts');
    expect(declarationFor('./dist/Button.svelte')).toBe('./dist/Button.svelte.d.ts');
    expect(declarationFor('./dist/styles.css')).toBeNull();
  });

  it('flattens condition objects and finds relative specifiers', () => {
    expect(
      exportTargets({
        '.': { types: './src/index.ts', svelte: './src/index.ts', default: './src/index.ts' },
        './styles.css': './src/styles.css',
      })
    ).toEqual([
      ['.', './src/index.ts'],
      ['.', './src/index.ts'],
      ['.', './src/index.ts'],
      ['./styles.css', './src/styles.css'],
    ]);
    expect(
      relativeSpecifiers(
        "import a from './a.js';\nexport { b } from '../b.svelte';\nimport './c.css';\nawait import('./d.js');\nimport x from 'svelte';"
      )
    ).toEqual(['./a.js', '../b.svelte', './c.css', './d.js']);
  });
});

describe('Svelte packages are opted in to svelte-package', () => {
  it('each has svelte.config.js, a tsconfig.build.json that rewrites .ts imports, and the svelte strategy', () => {
    const graph = readPackageGraph(REPO);
    for (const pkg of SVELTE_PACKAGES) {
      const dir = join(REPO, 'packages', pkg);
      expect(existsSync(join(dir, 'svelte.config.js')), pkg).toBe(true);
      const build = JSON.parse(readFileSync(join(dir, 'tsconfig.build.json'), 'utf8')) as {
        compilerOptions?: { rewriteRelativeImportExtensions?: boolean };
      };
      expect(build.compilerOptions?.rewriteRelativeImportExtensions, pkg).toBe(true);
      expect(graph.byName.get(manifest(pkg).name)?.buildConfig, pkg).toBe('svelte');
    }
  });

  it('`--filter svelte` selects all ten, plus only their buildable dependencies', () => {
    const graph = readPackageGraph(REPO);
    const selected = selectPackageNames(graph, ['svelte']);
    for (const pkg of SVELTE_PACKAGES) expect(selected.has(manifest(pkg).name), pkg).toBe(true);
    const svelteNames = new Set(SVELTE_PACKAGES.map((pkg) => manifest(pkg).name));
    for (const name of selected) {
      if (svelteNames.has(name)) continue;
      // Anything else is a workspace dependency pulled in by the selection.
      expect(graph.byName.has(name), name).toBe(true);
    }
  });

  it('every source export target exists, so the dist mapping has a source', () => {
    for (const pkg of SVELTE_PACKAGES) {
      for (const [subpath, target] of exportTargets(manifest(pkg).exports)) {
        expect(existsSync(join(REPO, 'packages', pkg, target)), `${pkg} ${subpath}`).toBe(true);
        expect(() => distPathFor(target), `${pkg} ${subpath}`).not.toThrow();
      }
    }
  });
});

const built = SVELTE_PACKAGES.every((pkg) => existsSync(join(REPO, 'packages', pkg, 'dist')));

describe.skipIf(!built)('dist parity (after pnpm build:packages --filter svelte)', () => {
  it('every exported subpath has its dist file and declarations', () => {
    let checked = 0;
    for (const pkg of SVELTE_PACKAGES) {
      const dir = join(REPO, 'packages', pkg);
      for (const [subpath, target] of exportTargets(manifest(pkg).exports)) {
        const dist = distPathFor(target);
        expect(existsSync(join(dir, dist)), `${pkg} ${subpath} → ${dist}`).toBe(true);
        const declaration = declarationFor(dist);
        if (declaration) {
          expect(existsSync(join(dir, declaration)), `${pkg} ${subpath} → ${declaration}`).toBe(
            true
          );
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('the lazy kits keep at least the subpaths they had when packaging started', () => {
    // Floors, not exact counts: new subpaths are fine, losing one is not.
    const floors: Record<string, number> = {
      'views-ui': 15,
      'charts-ui': 8,
      'analytics-ui': 8,
      crud: 8,
      'review-ui': 6,
      'blocks-ui': 11,
    };
    for (const [pkg, floor] of Object.entries(floors)) {
      expect(Object.keys(manifest(pkg).exports).length, pkg).toBeGreaterThanOrEqual(floor);
    }
  });

  it('no dist import still ends in .ts, and every relative import resolves inside dist', () => {
    const problems: string[] = [];
    let scanned = 0;
    for (const pkg of SVELTE_PACKAGES) {
      const dist = join(REPO, 'packages', pkg, 'dist');
      for (const file of walk(dist).filter((f) => /\.(?:[cm]?js|svelte)$/.test(f))) {
        scanned += 1;
        for (const specifier of relativeSpecifiers(readFileSync(file, 'utf8'))) {
          const at = `${relative(REPO, file)}: ${specifier}`;
          if (/\.[cm]?ts$/.test(specifier) && !/\.d\.[cm]?ts$/.test(specifier)) {
            problems.push(`${at} (TypeScript extension)`);
            continue;
          }
          const target = resolve(dirname(file), specifier);
          const rel = relative(dist, target);
          if (rel.startsWith(`..${sep}`) || rel === '..') problems.push(`${at} (leaves dist)`);
          else if (!existsSync(target)) problems.push(`${at} (missing)`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(200);
    expect(problems).toEqual([]);
  });

  it("renderer-svelte's node-side entries are plain JavaScript", () => {
    const dist = join(REPO, 'packages', 'renderer-svelte', 'dist');
    for (const file of ['vite.js', 'avatars-plugin.js']) {
      const code = readFileSync(join(dist, file), 'utf8');
      expect(code, file).not.toMatch(/^\s*import\s+type\s/m);
      expect(code, file).not.toMatch(/\binterface\s+[A-Z]\w*\s*\{/);
      expect(existsSync(join(dist, file.replace(/\.js$/, '.d.ts'))), file).toBe(true);
    }
  });
});
