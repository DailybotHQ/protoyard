// @ts-check
/**
 * `prepack`: copies the repository's top-level guides (`docs/*.md`, git-tracked
 * only) into this package as `guides/`, so a gallery installed from npm serves
 * them at `/docs/` (src/lib/docs/index.ts reads `guides/` first). `postpack`
 * (`--clean`) removes the copy, so `docs/` stays the only committed source.
 *
 *   node scripts/copy-guides.mjs [--clean]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = resolve(PACKAGE_DIR, '..', '..', 'docs');
export const DESTINATION = join(PACKAGE_DIR, 'guides');

/**
 * Top-level Markdown files git tracks in `source` (no folders, no symlinks).
 * @param {string} source
 * @returns {string[]}
 */
export function trackedGuides(source) {
  const result = spawnSync('git', ['-C', source, 'ls-files', '--stage', '-z', '--', '.'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `[protoyard] ${source} is not inside a git checkout: guides are copied from git-tracked files only.`
    );
  }
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(
      ([meta, path]) =>
        meta?.startsWith('100') && path && !path.includes('/') && path.endsWith('.md')
    )
    .map(([, path]) => /** @type {string} */ (path));
}

/** @param {{ clean?: boolean }} [options] */
export function copyGuides(options = {}) {
  rmSync(DESTINATION, { recursive: true, force: true });
  if (options.clean) return 0;
  if (!existsSync(SOURCE)) throw new Error(`[protoyard] ${SOURCE} does not exist.`);
  mkdirSync(DESTINATION, { recursive: true });
  let copied = 0;
  for (const file of trackedGuides(SOURCE)) {
    const from = join(SOURCE, file);
    if (lstatSync(from).isSymbolicLink()) continue;
    copyFileSync(from, join(DESTINATION, file));
    copied++;
  }
  return copied;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const clean = process.argv.includes('--clean');
  const count = copyGuides({ clean });
  if (!clean) console.log(`[protoyard] copied ${count} guides into ${DESTINATION}`);
}
