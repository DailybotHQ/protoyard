// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Root renders `<Toaster />`, so `@protoyard/ui` is always in a prototype's
 * entry chunk. A dynamic `import('@protoyard/ui')` anywhere (for example inside
 * a lazy shell frame) turns that barrel into a shared chunk the entry loads,
 * and every member read from it lands in EVERY prototype's initial JS. This
 * pulled WindowChrome and BrowserChrome into initial bundles (about 37 KB
 * gzip on crm-demo). Lazy modules import ui statically instead: they are
 * already lazy.
 */
const ROOT = join(import.meta.dirname, '../../..');
const SCANNED = ['packages', 'prototypes', 'templates', 'apps'];
const SKIP = new Set(['node_modules', 'dist', 'tests', '.astro']);
const SOURCE = /\.(ts|svelte|astro|js)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (SOURCE.test(name)) out.push(path);
  }
  return out;
}

describe('bundle hygiene', () => {
  it('never imports @protoyard/ui dynamically (it would bloat every initial chunk)', () => {
    const offenders = SCANNED.flatMap((top) => sourceFiles(join(ROOT, top)))
      .filter((file) => /import\(\s*['"]@protoyard\/ui['"]\s*\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('scans real sources (a scan that finds nothing proves nothing)', () => {
    const files = sourceFiles(join(ROOT, 'packages/renderer-svelte/src'));
    expect(files.some((f) => f.endsWith('ExtensionPopupFrame.svelte'))).toBe(true);
  });
});
