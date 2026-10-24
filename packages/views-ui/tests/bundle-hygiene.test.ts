// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Each view is its own lazy chunk (ADR-022). Three things would silently merge
 * chunks or leak views into initial JS:
 *  - a view importing another view's subpath (or its folder), so opening a
 *    board would also download the grid;
 *  - a dynamic `import('@protoyard/ui')`, which turns the ui barrel into a
 *    shared chunk the entry loads (docs/PERFORMANCE.md, Shells);
 *  - a root `.` export that re-exports every view.
 * `lib/` (helpers) and `states/` (the QueryState boundary every view renders)
 * are the only folders a view may share. A view built on another one declares
 * it in `DEPENDS`: the bundler then shares that
 * view's chunk instead of copying it, and nothing else pulls it in.
 */
const PKG = join(import.meta.dirname, '..');
const SRC = join(PKG, 'src');
const VIEWS = [
  'activity',
  'board',
  'calendar',
  'commands',
  'editor',
  'files',
  'grid',
  'map',
  'notifications',
  'scenarios',
  'settings',
  'states',
  'timeline',
  'tree',
  'virtual-list',
] as const;
const SHARED = new Set(['lib', 'states']);
/** Declared view → view edges after Texuli adoption (no cross-view host edges). */
const DEPENDS: Record<string, readonly string[]> = { files: ['tree'] };
const SOURCE = /\.(ts|svelte|js)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (SOURCE.test(name)) out.push(path);
  }
  return out;
}

/** Module specifiers and whether they use lazy `import()`. */
function specifiers(text: string): { specifier: string; dynamic: boolean }[] {
  const found: { specifier: string; dynamic: boolean }[] = [];
  for (const match of text.matchAll(
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/g
  )) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push({ specifier, dynamic: match[1] !== undefined });
  }
  return found;
}

/** The view folders a file in `ownView` reaches, other than itself and the shared ones. */
export function crossViewImports(ownView: string, text: string): string[] {
  const hits: string[] = [];
  for (const { specifier: spec, dynamic } of specifiers(text)) {
    const pkg = /^@protoyard\/views-ui\/([^/]+)/.exec(spec)?.[1];
    if (
      pkg &&
      pkg !== ownView &&
      !SHARED.has(pkg) &&
      !DEPENDS[ownView]?.includes(pkg) &&
      !dynamic
    ) {
      hits.push(spec);
    }
    // Relative paths that climb out of the view folder into a sibling view.
    const rel = /^(?:\.\.\/)+([^/.][^/]*)/.exec(spec)?.[1];
    if (
      rel &&
      rel !== ownView &&
      !SHARED.has(rel) &&
      !DEPENDS[ownView]?.includes(rel) &&
      (VIEWS as readonly string[]).includes(rel)
    ) {
      hits.push(spec);
    }
  }
  return hits;
}

export function dynamicUiBarrelImport(text: string): boolean {
  return /import\(\s*['"]@protoyard\/ui['"]\s*\)/.test(text);
}

function viewOf(file: string): string {
  return relative(SRC, file).split(sep)[0] ?? '';
}

describe('views-ui bundle hygiene', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  };

  it('exposes exactly one subpath per view plus styles.css, and no root barrel', () => {
    // ./player.css: the prebuilt player's scan; ./blocks.css: the view families content blocks render.
    expect(Object.keys(pkg.exports).sort()).toEqual(
      [...VIEWS.map((view) => `./${view}`), './styles.css', './player.css', './blocks.css'].sort()
    );
    expect(pkg.exports['.']).toBeUndefined();
  });

  it('points every subpath at an existing entry with types, svelte and default conditions', () => {
    for (const view of VIEWS) {
      const entry = pkg.exports[`./${view}`] as Record<string, string>;
      expect(entry).toEqual({
        types: `./src/${view}/index.ts`,
        svelte: `./src/${view}/index.ts`,
        default: `./src/${view}/index.ts`,
      });
      expect(existsSync(join(PKG, entry.default as string)), view).toBe(true);
    }
  });

  it('ships a styles.css that lets Tailwind scan the kit', () => {
    expect(readFileSync(join(SRC, 'styles.css'), 'utf8')).toContain('@source "./"');
  });

  it('keeps static imports within views while allowing lazy package subpath imports', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      crossViewImports(viewOf(file), readFileSync(file, 'utf8')).map(
        (spec) => `${relative(PKG, file)} → ${spec}`
      )
    );
    expect(offenders).toEqual([]);
  });

  it('never imports @protoyard/ui dynamically', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => dynamicUiBarrelImport(readFileSync(file, 'utf8')))
      .map((file) => relative(PKG, file));
    expect(offenders).toEqual([]);
  });

  it('imports only types from the @protoyard/views root (engines come from subpaths)', () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /^\s*import\s+(?!type\b)[^;]*from\s*['"]@protoyard\/views['"]/m.test(
        readFileSync(file, 'utf8')
      )
    );
    expect(offenders.map((file) => relative(PKG, file))).toEqual([]);
  });

  it('scans real sources (a scan that finds nothing proves nothing)', () => {
    const scanned = new Set(sourceFiles(SRC).map(viewOf));
    for (const view of VIEWS) expect(scanned.has(view), view).toBe(true);
  });

  it('detects the patterns it guards against', () => {
    expect(
      crossViewImports('board', "import { DataGrid } from '@protoyard/views-ui/grid';")
    ).toEqual(['@protoyard/views-ui/grid']);
    expect(crossViewImports('board', "import Grid from '../grid/DataGrid.svelte';")).toEqual([
      '../grid/DataGrid.svelte',
    ]);
    expect(crossViewImports('board', "const m = import('@protoyard/views-ui/calendar');")).toEqual(
      []
    );
    expect(crossViewImports('board', "const m = import('../calendar/index.ts');")).toEqual([
      '../calendar/index.ts',
    ]);
    expect(crossViewImports('board', "import { QueryState } from '../states/index.ts';")).toEqual(
      []
    );
    expect(crossViewImports('board', "import { cn } from '../lib/cn.ts';")).toEqual([]);
    // Declared edges only: files may use the tree, the tree may not use files.
    expect(crossViewImports('files', "import TreeView from '../tree/TreeView.svelte';")).toEqual(
      []
    );
    expect(crossViewImports('files', "import { DataGrid } from '../grid/index.ts';")).toEqual([
      '../grid/index.ts',
    ]);
    expect(crossViewImports('tree', "import X from '../files/index.ts';")).toEqual([
      '../files/index.ts',
    ]);
    expect(crossViewImports('board', "import Card from './Card.svelte';")).toEqual([]);
    expect(dynamicUiBarrelImport("await import('@protoyard/ui')")).toBe(true);
    expect(dynamicUiBarrelImport("import { Button } from '@protoyard/ui';")).toBe(false);
  });
});
