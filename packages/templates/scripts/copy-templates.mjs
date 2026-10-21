// @ts-check
/**
 * `prepack`: copies the repository's templates/ into this package so the
 * tarball carries them; `postpack` (`--clean`) removes the copy again, so
 * templates/ at the repository root stays the only committed source.
 *
 * Copies only files git tracks, so local, untracked files in a checkout
 * never ship. It also skips what `protoyard new` never copies (installs,
 * build output, local state and secrets) plus test output, even when tracked.
 * Symlinks and submodules are never followed.
 *
 *   node scripts/copy-templates.mjs [--clean]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = resolve(PACKAGE_DIR, '..', '..', 'templates');
export const DESTINATION = join(PACKAGE_DIR, 'templates');

/** Matches `SKIP_NAMES` in packages/cli/src/commands/new.ts, plus test output. */
export const SKIP_NAMES = new Set([
  '.git',
  '.env',
  '.envrc',
  '.npmrc',
  'node_modules',
  'dist',
  '.astro',
  'artifacts',
  '.protoyard',
  '.DS_Store',
  '.turbo',
  '.vite',
  'coverage',
  'test-results',
  'playwright-report',
  'blob-report',
]);

/** @param {string} name */
const skipped = (name) => SKIP_NAMES.has(name) || /^\.env\.(?!example$)/.test(name);

/**
 * Regular files git tracks under `source`, relative to it (`one/src/App.svelte`).
 * Symlinks (mode 120000) and submodules (160000) are left out.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function trackedFiles(source) {
  const result = spawnSync('git', ['-C', source, 'ls-files', '--stage', '-z', '--', '.'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `[protoyard] ${source} is not inside a git checkout: templates are copied from git-tracked files only.`
    );
  }
  const files = [];
  for (const record of result.stdout.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const mode = record.slice(0, record.indexOf(' '));
    if (mode !== '100644' && mode !== '100755') continue;
    files.push(record.slice(tab + 1));
  }
  return files.sort();
}
/**
 * Replaces `destination` with a copy of every template folder in `source`
 * that has a tracked protoyard.json, file by file from git's index.
 *
 * @param {string} [source]
 * @param {string} [destination]
 * @returns {{ templates: number, files: number }}
 */
export function copyTemplates(source = SOURCE, destination = DESTINATION) {
  if (!existsSync(source)) throw new Error(`[protoyard] templates not found at ${source}.`);
  const tracked = trackedFiles(source);
  const templates = new Set(
    tracked
      .filter((path) => /^[^/]+\/protoyard\.json$/.test(path))
      .map((path) => path.slice(0, path.indexOf('/')))
  );
  rmSync(destination, { recursive: true, force: true });
  let files = 0;
  for (const path of tracked) {
    const parts = path.split('/');
    if (!templates.has(parts[0] ?? '') || parts.some(skipped)) continue;
    const from = join(source, path);
    // A tracked file deleted in the working tree, or replaced by a link, is not copied.
    if (!existsSync(from) || !lstatSync(from).isFile()) continue;
    mkdirSync(dirname(join(destination, path)), { recursive: true });
    copyFileSync(from, join(destination, path));
    files++;
  }
  return { templates: templates.size, files };
}

/** @param {string} [destination] */
export function cleanTemplates(destination = DESTINATION) {
  rmSync(destination, { recursive: true, force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--clean')) cleanTemplates();
  else {
    const { templates, files } = copyTemplates();
    // stderr: pack lifecycle output must not mix with `pnpm pack --json` on stdout.
    console.error(`Packed ${templates} templates (${files} files) into ${DESTINATION}.`);
  }
}
