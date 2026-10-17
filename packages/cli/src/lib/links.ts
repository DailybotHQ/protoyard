import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isInside } from './paths.ts';

/** Install and build output at the prototype ROOT only: managed by tools, not content. */
const SKIP = new Set(['node_modules', 'dist', '.astro', '.vite', 'coverage']);

/**
 * Lists symlinks under `dir` (relative POSIX paths) that resolve outside it,
 * or that are dangling. Vite dereferences links in public/ and in imports,
 * so such a link would ship the target (e.g. ../../.env) in a build, ZIP or
 * deploy. Links that stay inside the folder are harmless and allowed.
 */
export function findEscapingSymlinks(dir: string, limit = 20): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      // Only top-level tool folders are skipped: a nested public/dist/ is content Vite copies.
      if (current === dir && SKIP.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        let target: string | null = null;
        try {
          target = realpathSync.native(full);
        } catch {
          target = null;
        }
        if (target === null || !isInside(dir, target)) {
          found.push(relative(dir, full).split(sep).join('/'));
        }
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(dir);
  return found;
}

/** True when the path itself (not its target) is a symlink. */
export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
