// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

function manifest(pkg: string): { name: string; exports: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(REPO, 'packages', pkg, 'package.json'), 'utf8'));
}

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
});
