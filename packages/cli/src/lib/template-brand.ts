import { constants, type FSWatcher, lstatSync, watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrandThemeError, isAppBlueprint, safeParseAnyBlueprint } from '@protoyard/blueprint';
import { TEMPLATE_BRAND_THEME_PATH, templateBrandThemeModule } from './codegen/emit.ts';
import { isInside } from './paths.ts';

/**
 * A deck made from the deck template keeps its brand resolved in
 * `src/brand-theme.ts`, so its first chunk never loads the palette generator
 * (`defineKindPrototype`). The module follows `src/blueprint.json`: `new`
 * writes it, `dev` rewrites it whenever the blueprint changes, and `validate`
 * fixes a stale one. Prototypes without both files are left alone.
 *
 * It never writes through a symlink: the folder, `src/`, the module and the
 * blueprint must be real (lstat), and the module must resolve inside the
 * folder; otherwise the result is `unsafe` and nothing is read or written.
 */

export const TEMPLATE_BLUEPRINT_PATH = 'src/blueprint.json';

export type TemplateBrandResult =
  /** Not a template-made deck: no `src/brand-theme.ts` or no `src/blueprint.json`. */
  | { status: 'absent' }
  | { status: 'current' }
  /** The module was stale (or `write: false` and it would be rewritten). */
  | { status: 'refreshed' | 'stale'; themeId: string | null }
  /** The blueprint does not parse or its brand does not resolve: nothing was written. */
  | { status: 'invalid'; message: string }
  /** A symlink (or a path leaving the folder) on the way: nothing was read or written. */
  | { status: 'unsafe'; message: string };

/** The entry at `path` without following a symlink, or null when there is none. */
function entry(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** Whether `dir` is a deck whose brand lives in `src/brand-theme.ts` (a symlink counts, to be refused). */
export function hasTemplateBrand(dir: string): boolean {
  return (
    entry(join(dir, TEMPLATE_BRAND_THEME_PATH)) !== null &&
    entry(join(dir, TEMPLATE_BLUEPRINT_PATH)) !== null
  );
}

/** Why the brand files of `dir` must not be touched, or null when they are real files inside it. */
export function templateBrandUnsafe(dir: string): string | null {
  const checks: [string, 'directory' | 'file'][] = [
    [dir, 'directory'],
    [join(dir, 'src'), 'directory'],
    [join(dir, TEMPLATE_BRAND_THEME_PATH), 'file'],
    [join(dir, TEMPLATE_BLUEPRINT_PATH), 'file'],
  ];
  for (const [path, kind] of checks) {
    const stat = entry(path);
    const name = path === dir ? 'the prototype folder' : path.slice(dir.length + 1);
    if (!stat) return `${name} is missing`;
    if (stat.isSymbolicLink()) return `${name} is a symlink, so it is never written through`;
    if (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())
      return `${name} is not a regular ${kind}`;
  }
  if (!isInside(dir, join(dir, TEMPLATE_BRAND_THEME_PATH)))
    return `${TEMPLATE_BRAND_THEME_PATH} resolves outside the prototype folder`;
  return null;
}

/**
 * Brings `src/brand-theme.ts` in step with the `brand` of `src/blueprint.json`.
 * Writes only when the text differs (and `write` is not false); an invalid
 * blueprint or brand leaves the module untouched.
 */
export async function refreshTemplateBrand(
  dir: string,
  { write = true }: { write?: boolean } = {}
): Promise<TemplateBrandResult> {
  if (!hasTemplateBrand(dir)) return { status: 'absent' };
  const unsafe = templateBrandUnsafe(dir);
  if (unsafe) return { status: 'unsafe', message: unsafe };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(dir, TEMPLATE_BLUEPRINT_PATH), 'utf8'));
  } catch (error) {
    return {
      status: 'invalid',
      message: `${TEMPLATE_BLUEPRINT_PATH} is not valid JSON: ${(error as Error).message}`,
    };
  }
  const parsed = await safeParseAnyBlueprint(raw);
  if (!parsed.success || isAppBlueprint(parsed.data)) {
    const issue = parsed.success ? undefined : parsed.error.issues[0];
    return {
      status: 'invalid',
      message: `${TEMPLATE_BLUEPRINT_PATH} is not a valid deck, page or doc blueprint${
        issue ? `: ${issue.path.map(String).join('.') || '(root)'} — ${issue.message}` : '.'
      }`,
    };
  }
  let source: string;
  try {
    source = templateBrandThemeModule(parsed.data);
  } catch (error) {
    if (error instanceof BrandThemeError) return { status: 'invalid', message: error.message };
    throw error;
  }
  const modulePath = join(dir, TEMPLATE_BRAND_THEME_PATH);
  if ((await readFile(modulePath, 'utf8')) === source) return { status: 'current' };
  const themeId = /export const defaultThemeId: string \| null = '([^']+)'/.exec(source)?.[1];
  if (!write) return { status: 'stale', themeId: themeId ?? null };
  // Reads and parsing awaited since the first check: check again, and open
  // without following a symlink swapped in at the module (O_NOFOLLOW; 0 on Windows).
  const swapped = templateBrandUnsafe(dir);
  if (swapped) return { status: 'unsafe', message: swapped };
  await writeFile(modulePath, source, {
    flag: constants.O_WRONLY | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0),
  });
  return { status: 'refreshed', themeId: themeId ?? null };
}

/**
 * Watches `src/blueprint.json` and refreshes `src/brand-theme.ts` after each
 * change (debounced; editors often save in several writes). Watches the `src`
 * folder, not the file, so an editor's replace-on-save keeps being seen.
 * Returns a stop function, or null when `dir` has no template brand.
 */
export function watchTemplateBrand(
  dir: string,
  onResult: (result: TemplateBrandResult) => void,
  { debounceMs = 150 }: { debounceMs?: number } = {}
): (() => void) | null {
  if (!hasTemplateBrand(dir)) return null;
  // Never watch through a symlinked src/: the start-up refresh already reported it.
  if (templateBrandUnsafe(dir)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();
  const watcher: FSWatcher = watch(join(dir, 'src'), (_event, file) => {
    if (file !== 'blueprint.json') return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // One refresh at a time, in order.
      running = running
        .then(() => refreshTemplateBrand(dir))
        .then(onResult, (error: unknown) =>
          onResult({ status: 'invalid', message: (error as Error).message })
        );
    }, debounceMs);
  });
  const stop = () => {
    clearTimeout(timer);
    watcher.close();
  };
  // src/ removed or renamed (a branch switch): stop watching and say so, never crash dev.
  watcher.on('error', (error) => {
    stop();
    onResult({
      status: 'invalid',
      message: `stopped watching ${TEMPLATE_BLUEPRINT_PATH}: ${(error as Error).message}`,
    });
  });
  return stop;
}
