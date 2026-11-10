import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DESIGN_SYSTEMS_DIR } from './design-systems.ts';

/** Folders that are output, dependencies or tests, never build inputs. */
const SKIP = new Set(['node_modules', 'dist', 'tests', '.vite', '.svelte-kit']);
/** Root files whose change can change a build (dependency versions). */
const ROOT_FILES = ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];
/** Past this many files the hash is not computed (a reuse is then never offered). */
const MAX_FILES = 20_000;

/**
 * A sha256 over what a prototype's build reads from the workspace: every
 * file of the prototype (dependencies, output and tests skipped), every file
 * under `design-systems/` (themes and `@ds/<id>/<Name>` components), and the
 * root manifest and lockfile. Paths and contents both count; a symlink counts
 * as its target text. `build` records it in `build-manifest.json`, and
 * `check ds --render` reuses a build only when it still matches.
 *
 * Not covered: edits to workspace packages' sources (in this repository,
 * `packages/*`) that leave the lockfile alone; `--rebuild` covers those.
 * Returns null when the inputs are too many to hash.
 */
export function buildInputsHash(root: string, prototypeDir: string): string | null {
  const entries: string[] = [];
  const add = (label: string, path: string): boolean => {
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(path);
    } catch {
      return true;
    }
    if (stat.isSymbolicLink()) {
      entries.push(`${label}\0link\0${readlinkSync(path)}`);
    } else if (stat.isDirectory()) {
      let names: string[];
      try {
        names = readdirSync(path).sort();
      } catch {
        return true;
      }
      for (const name of names) {
        if (SKIP.has(name)) continue;
        if (!add(`${label}/${name}`, join(path, name))) return false;
      }
    } else if (stat.isFile()) {
      const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
      entries.push(`${label}\0file\0${digest}`);
    }
    return entries.length <= MAX_FILES;
  };
  const prototypeLabel = relative(root, prototypeDir).split(sep).join('/');
  if (!add(`prototype:${prototypeLabel}`, prototypeDir)) return null;
  if (!add(DESIGN_SYSTEMS_DIR, join(root, DESIGN_SYSTEMS_DIR))) return null;
  for (const file of ROOT_FILES) add(`root:${file}`, join(root, file));
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}
