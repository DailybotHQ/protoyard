// @ts-check
/**
 * `prepack`: copies the repository's templates/ into this package so the
 * tarball carries them; `postpack` (`--clean`) removes the copy again, so
 * templates/ at the repository root stays the only committed source.
 *
 * Skips what `protoyard new` never copies (installs, build output, local
 * state and secrets) plus test output; symlinks are never followed.
 *
 *   node scripts/copy-templates.mjs [--clean]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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
 * @param {string} from
 * @param {string} to
 * @returns {number} files copied
 */
function copyDir(from, to) {
  let count = 0;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (skipped(entry.name)) continue;
    if (entry.isDirectory()) count += copyDir(join(from, entry.name), join(to, entry.name));
    else if (entry.isFile()) {
      copyFileSync(join(from, entry.name), join(to, entry.name));
      count++;
    }
  }
  return count;
}

/**
 * Replaces `destination` with a copy of every template folder in `source`
 * that has a protoyard.json.
 *
 * @param {string} [source]
 * @param {string} [destination]
 * @returns {{ templates: number, files: number }}
 */
export function copyTemplates(source = SOURCE, destination = DESTINATION) {
  if (!existsSync(source)) throw new Error(`[protoyard] templates not found at ${source}.`);
  rmSync(destination, { recursive: true, force: true });
  let templates = 0;
  let files = 0;
  for (const entry of readdirSync(source, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!entry.isDirectory() || !existsSync(join(source, entry.name, 'protoyard.json'))) continue;
    files += copyDir(join(source, entry.name), join(destination, entry.name));
    templates++;
  }
  return { templates, files };
}

/** @param {string} [destination] */
export function cleanTemplates(destination = DESTINATION) {
  rmSync(destination, { recursive: true, force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--clean')) cleanTemplates();
  else {
    const { templates, files } = copyTemplates();
    console.log(`Packed ${templates} templates (${files} files) into ${DESTINATION}.`);
  }
}
