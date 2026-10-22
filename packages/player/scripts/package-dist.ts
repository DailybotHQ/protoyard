/**
 * Trims the `build:packages` output to the published entries.
 *
 * `svelte-package` compiles all of `src/` into `dist/`, but the package only
 * publishes `./embed` and `./boot`. This script keeps exactly what those
 * entries import (JavaScript, compiled `.svelte` components and their
 * declarations), lays them out as `dist/embed/` and `dist/boot/`, and deletes
 * everything else except the kept folders (`dist/app/`, Vite's static player,
 * is never touched). It also points `new URL('./x.ts', import.meta.url)`
 * worker references at the emitted `.js`, which TypeScript does not rewrite.
 *
 * Run by `pnpm run build:package` (the package's `protoyard.build.postBuild`).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** Each published entry: its file in the raw output and the folder it ships in. */
export const PACKAGE_ENTRIES = [
  { entry: 'embed/index.js', folder: 'embed', from: 'embed' },
  { entry: 'boot.js', folder: 'boot', from: '' },
] as const;

/** Folders of `dist/` this script leaves alone. */
export const KEPT_FOLDERS = ['app'] as const;

const STAGING = '.package-staging';

// Static `import … from`, `export … from`, side-effect `import '…'`, dynamic
// `import('…')` and `new URL('…', import.meta.url)`, relative specifiers only.
const RELATIVE_SPECIFIER =
  /(?:import|export)\s[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s+['"](\.{1,2}\/[^'"]+)['"]|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;

const WORKER_URL = /new URL\((\s*)(['"])(\.{1,2}\/[^'"]+)\.ts\2(\s*,\s*import\.meta\.url\s*\))/g;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

/** Rewrites `new URL('./x.ts', import.meta.url)` to `./x.js` when that file was emitted. */
export function rewriteWorkerUrls(dist: string): string[] {
  const changed: string[] = [];
  for (const file of filesUnder(dist)) {
    if (!/\.(?:js|svelte)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const next = text.replace(WORKER_URL, (match, space, quote, base, tail) =>
      existsSync(resolve(dirname(file), `${base}.js`))
        ? `new URL(${space}${quote}${base}.js${quote}${tail}`
        : match
    );
    if (next !== text) {
      writeFileSync(file, next);
      changed.push(relative(dist, file));
    }
  }
  return changed;
}

/** The declaration file that types `file`, when it exists. */
function declarationOf(file: string): string | null {
  const candidates = file.endsWith('.svelte')
    ? [`${file}.d.ts`]
    : file.endsWith('.d.ts')
      ? []
      : [file.replace(/\.(?:js|ts)$/, '.d.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Where a relative specifier from a declaration file points (`.ts`/`.js` → `.d.ts`). */
function declarationTarget(from: string, specifier: string): string {
  const target = resolve(dirname(from), specifier);
  if (target.endsWith('.svelte')) return `${target}.d.ts`;
  return target.replace(/\.(?:js|ts)$/, '.d.ts');
}

/**
 * Every file `entry` reaches through relative specifiers, plus their
 * declarations. Throws when a specifier points at a file that was not
 * emitted, so a published entry can never reference a missing module.
 */
export function entryClosure(dist: string, entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!/\.(?:js|svelte|ts)$/.test(file)) return;
    const isDeclaration = file.endsWith('.d.ts');
    for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_SPECIFIER)) {
      const specifier = (match[1] ?? match[2] ?? match[3] ?? match[4]) as string;
      const target = isDeclaration
        ? declarationTarget(file, specifier)
        : resolve(dirname(file), specifier);
      if (!existsSync(target)) {
        throw new Error(
          `${relative(dist, file)} imports ${specifier}, which the package build did not emit.`
        );
      }
      visit(target);
    }
    const declaration = declarationOf(file);
    if (declaration) visit(declaration);
  };
  const start = join(dist, entry);
  if (!existsSync(start)) throw new Error(`The package build did not emit ${entry}.`);
  visit(start);
  return [...seen].map((file) => relative(dist, file)).sort();
}

export interface PackageDistResult {
  /** Published files, relative to `dist/`, after the move. */
  kept: string[];
  /** Raw output files that were deleted. */
  removed: string[];
  /** Files whose worker URL now points at `.js`. */
  rewritten: string[];
}

/** Trims `dist/` to the published entries; see the module comment. */
export function packageDist(dist: string): PackageDistResult {
  const rewritten = rewriteWorkerUrls(dist);
  const staging = join(dist, STAGING);
  rmSync(staging, { recursive: true, force: true });
  const kept: string[] = [];
  for (const { entry, folder, from } of PACKAGE_ENTRIES) {
    for (const file of entryClosure(dist, entry)) {
      const inside = from === '' ? file : relative(from, file);
      if (inside.startsWith('..') || inside.startsWith(sep)) {
        throw new Error(`${entry} reaches ${file}, outside its ${from}/ folder.`);
      }
      const destination = join(staging, folder, inside);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(dist, file), destination);
      kept.push(join(folder, inside));
    }
  }
  const removed: string[] = [];
  for (const name of readdirSync(dist)) {
    if (name === STAGING || (KEPT_FOLDERS as readonly string[]).includes(name)) continue;
    const path = join(dist, name);
    if (statSync(path).isDirectory())
      removed.push(...filesUnder(path).map((f) => relative(dist, f)));
    else removed.push(name);
    rmSync(path, { recursive: true, force: true });
  }
  for (const name of readdirSync(staging)) renameSync(join(staging, name), join(dist, name));
  rmSync(staging, { recursive: true, force: true });
  const published = new Set(kept);
  return {
    kept: kept.sort(),
    removed: removed.filter((file) => !published.has(file)).sort(),
    rewritten,
  };
}

if (import.meta.main) {
  const dist = resolve(import.meta.dirname, '..', 'dist');
  const result = packageDist(dist);
  console.log(
    `package dist: kept ${result.kept.length} files in ${PACKAGE_ENTRIES.map((e) => `dist/${e.folder}/`).join(', ')}; removed ${result.removed.length}.`
  );
}
