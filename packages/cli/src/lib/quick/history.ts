import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type AnyBlueprint, blueprintIdentity } from '@protoyard/blueprint';
import { parseQuickBlueprint } from './blueprint-kind.ts';

/**
 * The blueprints an exploration had before each `quick iterate`, read back
 * from its `history/NNNN.json` entries. Each entry keeps the exact previous
 * blueprint.json text; hashing it with `blueprintIdentity` (as the player
 * does) gives the storage namespace a tab opened on that version still uses.
 * A tab that live-reloads after an iterate keeps its world, its validation
 * metrics and its review comments under that earlier namespace.
 *
 * Entries are untrusted files on disk: size-capped, symlinks refused, and an
 * entry whose text does not match its recorded identity is skipped, so it
 * never vouches for a namespace.
 */

export const QUICK_HISTORY_ENTRY_MAX_BYTES = 4 * 1024 * 1024;
const ENTRY_NAME = /^(\d{4})\.json$/;

export interface EarlierBlueprint {
  /** The history entry (`history/0001.json` is 1): the blueprint before that change. */
  sequence: number;
  namespace: string;
  identitySha256: string;
  blueprint: AnyBlueprint;
}

/** Earlier blueprints of the exploration in `dir`, newest change first, at most `limit`. */
export async function historyBlueprints(dir: string, limit = 64): Promise<EarlierBlueprint[]> {
  const names = (await readdir(join(dir, 'history')).catch(() => [] as string[]))
    .filter((name) => ENTRY_NAME.test(name))
    .sort()
    .reverse()
    .slice(0, limit);
  const earlier: EarlierBlueprint[] = [];
  for (const name of names) {
    const path = join(dir, 'history', name);
    const info = await lstat(path).catch(() => undefined);
    if (!info?.isFile() || info.size > QUICK_HISTORY_ENTRY_MAX_BYTES) continue;
    try {
      const entry = JSON.parse(await readFile(path, 'utf8')) as {
        before?: { text?: unknown; identitySha256?: unknown };
      };
      if (typeof entry.before?.text !== 'string') continue;
      const blueprint = await parseQuickBlueprint(JSON.parse(entry.before.text) as unknown);
      const identity = await blueprintIdentity(blueprint);
      const recorded = entry.before.identitySha256;
      if (recorded !== undefined && recorded !== identity.sha256) continue;
      earlier.push({
        sequence: Number(ENTRY_NAME.exec(name)?.[1]),
        namespace: identity.namespace,
        identitySha256: identity.sha256,
        blueprint,
      });
    } catch {
      // A damaged entry only loses its namespace; quick undo reports it.
    }
  }
  return earlier;
}

/** `history/0001.json` style label for a history sequence number. */
export const historyEntryName = (sequence: number) =>
  `history/${String(sequence).padStart(4, '0')}.json`;
