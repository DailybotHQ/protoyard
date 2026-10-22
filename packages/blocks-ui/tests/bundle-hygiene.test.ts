// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Each content family is a lazy chunk. The dispatcher may load families on
 * demand, but a family must not pull a sibling family into its own chunk.
 * `lib/` and `text/` are deliberately shared: text's MdRenderer is also used
 * by data captions and interactive prompts. Any other cross-family edge must
 * be declared in DEPENDS so the shared chunk is explicit and reviewable.
 */
const PKG = join(import.meta.dirname, '..');
const SRC = join(PKG, 'src');
const FAMILIES = [
  'text',
  'media',
  'data',
  'structure',
  'code',
  'diagram',
  'interactive',
  'map',
  'embed',
] as const;
type Family = (typeof FAMILIES)[number];

const SHARED = new Set<string>(['lib', 'text']);
/** Explicit family → family edges; currently all cross-family sharing uses `text/`. */
const DEPENDS: Partial<Record<Family, readonly Family[]>> = {};
const SOURCE = /\.(ts|svelte|js)$/;
const FORBIDDEN_PACKAGE =
  /^@protoyard\/(?:crud|player|database)(?:\/|$)|^@faker-js\/faker(?:\/|$)|^faker(?:\/|$)/;

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

/** The family folders a file in `ownFamily` reaches, except declared/shared folders. */
export function crossFamilyImports(
  ownFamily: Family,
  text: string,
  depends: Partial<Record<Family, readonly Family[]>> = DEPENDS
): string[] {
  const hits: string[] = [];
  for (const { specifier: spec } of specifiers(text)) {
    const packageFamily = /^@protoyard\/blocks-ui\/([^/]+)/.exec(spec)?.[1];
    if (
      packageFamily &&
      packageFamily !== ownFamily &&
      !SHARED.has(packageFamily) &&
      !depends[ownFamily]?.includes(packageFamily as Family)
    ) {
      hits.push(spec);
    }

    // Relative paths that climb out of a family into a sibling family.
    const relativeFamily = /^(?:\.\.\/)+([^/.][^/]*)/.exec(spec)?.[1];
    if (
      relativeFamily &&
      relativeFamily !== ownFamily &&
      !SHARED.has(relativeFamily) &&
      !depends[ownFamily]?.includes(relativeFamily as Family) &&
      (FAMILIES as readonly string[]).includes(relativeFamily)
    ) {
      hits.push(spec);
    }
  }
  return hits;
}

export function dynamicUiBarrelImport(text: string): boolean {
  return /\bimport\s*\(\s*['"]@protoyard\/ui['"]\s*\)/.test(text);
}

function familyOf(file: string): string {
  return relative(SRC, file).split(sep)[0] ?? '';
}

function rootFamilyImports(text: string): string[] {
  return specifiers(text)
    .map(({ specifier }) => {
      const packageFamily = /^@protoyard\/blocks-ui\/([^/]+)/.exec(specifier)?.[1];
      if (packageFamily && (FAMILIES as readonly string[]).includes(packageFamily)) {
        return specifier;
      }
      const relativeFamily = /^\.\/([^/.][^/]*)/.exec(specifier)?.[1];
      if (relativeFamily && (FAMILIES as readonly string[]).includes(relativeFamily)) {
        return specifier;
      }
      return null;
    })
    .filter((specifier): specifier is string => specifier !== null);
}

describe('blocks-ui bundle hygiene', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  };

  it('exposes a root dispatcher, one subpath per family and styles.css', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(
      ['.', ...FAMILIES.map((family) => `./${family}`), './styles.css'].sort()
    );
    expect(pkg.exports['.']).toEqual({
      types: './src/index.ts',
      svelte: './src/index.ts',
      default: './src/index.ts',
    });
  });

  it('points every family export at an existing entry with types, svelte and default conditions', () => {
    for (const family of FAMILIES) {
      const entry = pkg.exports[`./${family}`] as Record<string, string>;
      expect(entry).toEqual({
        types: `./src/${family}/index.ts`,
        svelte: `./src/${family}/index.ts`,
        default: `./src/${family}/index.ts`,
      });
      expect(existsSync(join(PKG, entry.default as string)), family).toBe(true);
    }
  });

  it('keeps family modules inside their chunks except for declared and shared folders', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => (FAMILIES as readonly string[]).includes(familyOf(file)))
      .flatMap((file) =>
        crossFamilyImports(familyOf(file) as Family, readFileSync(file, 'utf8')).map(
          (specifier) => `${relative(PKG, file)} → ${specifier}`
        )
      );
    expect(offenders).toEqual([]);
  });

  it('keeps family cross-import exceptions explicit', () => {
    expect(
      crossFamilyImports('media', "import Markdown from '../text/MdRenderer.svelte';")
    ).toEqual([]);
    expect(
      crossFamilyImports('map', "import TreeView from '../diagram/Tree.svelte';", {
        map: ['diagram'],
      })
    ).toEqual([]);
  });

  it('never dynamically imports the @protoyard/ui barrel', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => dynamicUiBarrelImport(readFileSync(file, 'utf8')))
      .map((file) => relative(PKG, file));
    expect(offenders).toEqual([]);
  });

  it('does not re-export a family from the root entry', () => {
    expect(rootFamilyImports(readFileSync(join(SRC, 'index.ts'), 'utf8'))).toEqual([]);
  });

  it('does not import the app stack, Faker or the database', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter(({ specifier }) => FORBIDDEN_PACKAGE.test(specifier))
        .map(({ specifier }) => `${relative(PKG, file)} → ${specifier}`)
    );
    expect(offenders).toEqual([]);
  });

  it('scans every real family source folder', () => {
    const scanned = new Set(
      sourceFiles(SRC)
        .map(familyOf)
        .filter((folder) => (FAMILIES as readonly string[]).includes(folder))
    );
    for (const family of FAMILIES) expect(scanned.has(family), family).toBe(true);
  });

  it('fails against a planted cross-family import fixture', () => {
    expect(
      crossFamilyImports('text', "import { ChartBlock } from '../data/ChartBlock.svelte';")
    ).toEqual(['../data/ChartBlock.svelte']);
    expect(
      crossFamilyImports('text', "import { ChartBlock } from '@protoyard/blocks-ui/data';")
    ).toEqual(['@protoyard/blocks-ui/data']);
    expect(dynamicUiBarrelImport("const ui = await import('@protoyard/ui');")).toBe(true);
  });
});
