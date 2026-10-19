// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Review comments must cost 0 bytes until review is enabled and must run where
 * they are deployed (ADR on review comments; docs/PERFORMANCE.md, Shells):
 *  - a dynamic `import('@protoyard/ui')` would turn the ui barrel into a shared
 *    chunk that every prototype's entry loads;
 *  - the `@protoyard/review/server` handler is bundled into a Cloudflare Pages
 *    worker and unit-tested in Node, so it may use only Web APIs: no Svelte, no
 *    UI packages, no Dexie or database, no `node:` modules, no DOM globals;
 *  - the rest of `@protoyard/review` is framework-free (anchors may read the DOM
 *    they are given, but never import Svelte or UI);
 *  - overlay, panel and toolbar stay separate chunks; `mount` composes them.
 */
const ROOT = join(import.meta.dirname, '../..');
const UI = join(ROOT, 'review-ui');
const ENGINE = join(ROOT, 'review');
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

/** Module specifiers: static imports, re-exports and dynamic imports. */
export function specifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

/** Source without comments or string contents, so words in docs never count as code. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''");
}

const FRAMEWORK =
  /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|review-ui|renderer-svelte|devtools)(\/|$)/;
const SERVER_FORBIDDEN =
  /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|review-ui|renderer-svelte|devtools|database)(\/|$)|^dexie$|^node:/;
const DOM_GLOBALS =
  /\b(window|document|navigator|localStorage|sessionStorage|indexedDB|location|HTMLElement)\b/;

export function serverViolations(text: string): string[] {
  const imports = specifiers(text).filter((spec) => SERVER_FORBIDDEN.test(spec));
  const dom = DOM_GLOBALS.exec(codeOnly(text));
  return dom ? [...imports, dom[1] as string] : imports;
}

export function dynamicUiBarrelImport(text: string): boolean {
  return /import\(\s*['"]@protoyard\/ui['"]\s*\)/.test(text);
}

const UI_PARTS = ['overlay', 'thread', 'panel', 'toolbar', 'mount'] as const;
const ENGINE_PARTS = [
  'anchors',
  'store',
  'adapters/local',
  'adapters/http',
  'adapters/artifact',
  'adapters/artifact-shell',
  'server',
  'report',
] as const;

/** UI parts a file in `ownPart` reaches, other than `lib`; only `mount` may compose the others. */
export function crossPartImports(ownPart: string, text: string): string[] {
  if (ownPart === 'mount') return [];
  return specifiers(text).filter((spec) => {
    const pkg = /^@protoyard\/review-ui\/([^/]+)/.exec(spec)?.[1];
    const rel = /^(?:\.\.\/)+([^/.][^/]*)/.exec(spec)?.[1];
    const target = pkg ?? rel;
    return (
      target !== undefined && target !== ownPart && (UI_PARTS as readonly string[]).includes(target)
    );
  });
}

describe('review packages: exports', () => {
  it('review-ui exposes overlay, thread, panel, toolbar, mount and styles.css, and no root barrel', () => {
    const pkg = JSON.parse(readFileSync(join(UI, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(pkg.exports).sort()).toEqual(
      [...UI_PARTS.map((p) => `./${p}`), './styles.css'].sort()
    );
    for (const part of UI_PARTS) {
      const entry = pkg.exports[`./${part}`] as Record<string, string>;
      expect(entry).toEqual({
        types: `./src/${part}/index.ts`,
        svelte: `./src/${part}/index.ts`,
        default: `./src/${part}/index.ts`,
      });
      expect(existsSync(join(UI, entry.default as string)), part).toBe(true);
    }
    expect(readFileSync(join(UI, 'src/styles.css'), 'utf8')).toContain('@source "./"');
  });

  it('review exposes its eight subpaths, and no root barrel', () => {
    const pkg = JSON.parse(readFileSync(join(ENGINE, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
      sideEffects: boolean;
    };
    expect(Object.keys(pkg.exports).sort()).toEqual(ENGINE_PARTS.map((p) => `./${p}`).sort());
    for (const [key, target] of Object.entries(pkg.exports))
      expect(existsSync(join(ENGINE, target)), key).toBe(true);
    expect(pkg.sideEffects).toBe(false);
  });
});

describe('review packages: imports', () => {
  const uiFiles = sourceFiles(join(UI, 'src'));
  const engineFiles = sourceFiles(join(ENGINE, 'src'));
  const serverFiles = sourceFiles(join(ENGINE, 'src/server'));

  it('scans real sources (a scan that finds nothing proves nothing)', () => {
    const uiParts = new Set(uiFiles.map((f) => relative(join(UI, 'src'), f).split(sep)[0]));
    for (const part of UI_PARTS) expect(uiParts.has(part), part).toBe(true);
    expect(engineFiles.length).toBeGreaterThanOrEqual(ENGINE_PARTS.length);
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it('never imports @protoyard/ui dynamically', () => {
    const offenders = [...uiFiles, ...engineFiles].filter((f) =>
      dynamicUiBarrelImport(readFileSync(f, 'utf8'))
    );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('keeps the server handler to Web APIs only', () => {
    const offenders = serverFiles.flatMap((f) =>
      serverViolations(readFileSync(f, 'utf8')).map((v) => `${relative(ROOT, f)} → ${v}`)
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the review engine free of Svelte and UI packages', () => {
    const offenders = engineFiles.flatMap((f) =>
      specifiers(readFileSync(f, 'utf8'))
        .filter((spec) => FRAMEWORK.test(spec))
        .map((spec) => `${relative(ROOT, f)} → ${spec}`)
    );
    expect(offenders).toEqual([]);
  });

  it('keeps overlay, panel and toolbar separate (only mount composes them)', () => {
    const offenders = uiFiles.flatMap((f) => {
      const part = relative(join(UI, 'src'), f).split(sep)[0] ?? '';
      return crossPartImports(part, readFileSync(f, 'utf8')).map(
        (spec) => `${relative(ROOT, f)} → ${spec}`
      );
    });
    expect(offenders).toEqual([]);
  });

  it('detects the patterns it guards against', () => {
    expect(dynamicUiBarrelImport("await import('@protoyard/ui')")).toBe(true);
    expect(dynamicUiBarrelImport("import { Button } from '@protoyard/ui';")).toBe(false);
    expect(serverViolations("import { mount } from 'svelte';")).toEqual(['svelte']);
    expect(serverViolations("import Dexie from 'dexie';")).toEqual(['dexie']);
    expect(serverViolations("import { readFile } from 'node:fs/promises';")).toEqual([
      'node:fs/promises',
    ]);
    expect(serverViolations('const key = localStorage.getItem("k");')).toEqual(['localStorage']);
    expect(serverViolations('// the window of time\nconst s = "document";')).toEqual([]);
    expect(serverViolations("import { z } from 'zod';\nconst r = new Response('ok');")).toEqual([]);
    expect(crossPartImports('panel', "import Pin from '../overlay/Pin.svelte';")).toEqual([
      '../overlay/Pin.svelte',
    ]);
    expect(crossPartImports('panel', "import { x } from '../lib/x.ts';")).toEqual([]);
    expect(crossPartImports('mount', "import Overlay from '../overlay/index.ts';")).toEqual([]);
  });
});
