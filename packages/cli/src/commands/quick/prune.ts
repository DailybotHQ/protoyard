import { lstat, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag, opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { guardOutputDir, outputDirState, QUICK_MARKER } from '../../lib/output-guard.ts';
import { canonicalPath, samePath, toPosixRelative } from '../../lib/paths.ts';
import { readQuickRecord } from '../../lib/quick/model.ts';
import { type QuickListEntry, scanQuickExplorations } from './list.ts';

/**
 * `protoyard quick prune [--older-than 14d] [--yes] [--force]`: removes old
 * explorations from the quick zone. Without `--yes` it only lists what it
 * would remove. Only `--yes` typed on this command deletes: `CI=1`, which
 * implies the global `--yes` elsewhere, never does.
 *
 * Candidates come from the same scan as `quick list` (real folders with the
 * quick marker and a valid quick.json, never symlinks or `_player/`), last
 * updated before the cutoff. It never removes a promoted exploration, and it
 * keeps one whose served comments are newer than its REVIEW.md unless
 * `--force`. Right before each removal everything is checked again (the
 * folder is a real, marked direct child of the canonical quick zone reached
 * without links, its quick.json is still old and not promoted), so a folder
 * swapped in between the listing and the removal survives.
 */

export const QUICK_PRUNE_DEFAULT_AGE = '14d';
const UNIT_MS = { h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const;

/** `14d`, `36h`, `2w` → milliseconds. */
export function parseAge(value: string): number {
  const match = /^(\d{1,5})([hdw])$/.exec(value.trim());
  if (!match) {
    throw new CliError('usage', `--older-than must look like 14d, 36h or 2w (got "${value}").`);
  }
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

/** Served comments that REVIEW.md does not reflect yet (none, or older than the comments). */
async function unsavedFeedback(dir: string): Promise<boolean> {
  const store = join(dir, 'review', 'comments.json');
  const info = await lstat(store).catch(() => undefined);
  if (!info?.isFile()) return false;
  let count = 0;
  try {
    const value = JSON.parse(await readFile(store, 'utf8')) as { comments?: unknown };
    count = Array.isArray(value.comments) ? value.comments.length : 0;
  } catch {
    // Unreadable comments are treated as unsaved: never delete what cannot be checked.
    return true;
  }
  if (count === 0) return false;
  const report = await lstat(join(dir, 'REVIEW.md')).catch(() => undefined);
  return !report?.isFile() || report.mtimeMs < info.mtimeMs;
}

interface PruneEntry {
  slug: string;
  dir: string;
  updatedAt: string;
  ageDays: number;
}

export const quickPruneCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const olderThan = opt(options, 'olderThan') ?? QUICK_PRUNE_DEFAULT_AGE;
  const ageMs = parseAge(olderThan);
  const now = Date.now();
  const cutoff = now - ageMs;
  // The flag itself, never `ctx.yes` (CI=1): deleting needs an explicit --yes here.
  const remove = flag(options, 'yes');
  const force = flag(options, 'force');

  const scan = await scanQuickExplorations(ctx.root, process.cwd());
  const zone = join(ctx.root, scan.root);
  const entry = (e: QuickListEntry): PruneEntry => ({
    slug: e.slug,
    dir: e.dir,
    updatedAt: e.updatedAt,
    ageDays: Math.floor((now - Date.parse(e.updatedAt)) / UNIT_MS.d),
  });
  const candidates: PruneEntry[] = [];
  const kept: (PruneEntry & { reason: 'promoted' | 'unsaved-feedback' })[] = [];
  for (const exploration of scan.explorations) {
    if (Date.parse(exploration.updatedAt) >= cutoff) continue;
    if (exploration.promotedTo) {
      kept.push({ ...entry(exploration), reason: 'promoted' });
    } else if (!force && (await unsavedFeedback(join(ctx.root, exploration.dir)))) {
      kept.push({ ...entry(exploration), reason: 'unsaved-feedback' });
    } else {
      candidates.push(entry(exploration));
    }
  }

  const deleted: PruneEntry[] = [];
  const refused: { slug: string; dir: string; reason: string }[] = [];
  if (remove) {
    const canonicalZone = canonicalPath(zone);
    for (const candidate of candidates) {
      const dir = join(ctx.root, candidate.dir);
      try {
        // Same rules as writing into the zone: inside it, through real folders, no links.
        const target = guardOutputDir({
          root: ctx.root,
          paths: ctx.paths,
          requested: dir,
          marker: QUICK_MARKER,
          flag: 'quick prune',
        });
        const info = await lstat(dir);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('not a real folder');
        if (!samePath(dirname(target), canonicalZone) || basename(target) === '_player') {
          throw new Error('not an exploration folder directly in the quick zone');
        }
        if (outputDirState(target, QUICK_MARKER) !== 'marked') throw new Error('not marked');
        const marker = await lstat(join(target, QUICK_MARKER));
        if (!marker.isFile()) throw new Error('the marker is not a file');
        const record = await readQuickRecord(target);
        if (record.promotedTo) throw new Error('it was promoted');
        if (Date.parse(record.updatedAt) >= cutoff) throw new Error('it was updated');
        if (!force && (await unsavedFeedback(target))) throw new Error('it has unsaved feedback');
        await rm(target, { recursive: true, force: false });
        deleted.push(candidate);
      } catch (error) {
        refused.push({
          slug: candidate.slug,
          dir: candidate.dir,
          reason: (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '',
        });
      }
    }
  }

  const data = {
    root: scan.root,
    olderThan,
    cutoff: new Date(cutoff).toISOString(),
    dryRun: !remove,
    candidates,
    deleted,
    kept,
    refused,
    skipped: scan.skipped,
  };
  return {
    data,
    render(out) {
      const { c } = out;
      const list = remove ? deleted : candidates;
      if (list.length === 0) {
        out.always(`${mark(c, 'skip')} No explorations older than ${olderThan} to remove.`);
      } else if (remove) {
        out.always(`${mark(c, 'pass')} Removed ${deleted.length} exploration(s):`);
      } else {
        out.always(
          `${mark(c, 'skip')} Dry run: would remove ${candidates.length} exploration(s) (pass --yes to remove):`
        );
      }
      for (const item of list) out.always(`  ${item.dir}  ${c.dim(`(${item.ageDays} days old)`)}`);
      for (const item of kept) {
        out.info(
          `${mark(c, 'skip')} kept ${item.dir}: ${item.reason === 'promoted' ? 'promoted to a prototype' : 'comments newer than REVIEW.md (run quick feedback, or --force)'}`
        );
      }
      for (const item of refused)
        out.warn(`${mark(c, 'warn')} not removed ${item.dir}: ${item.reason}`);
      for (const skip of scan.skipped)
        out.warn(`${mark(c, 'warn')} skipped ${skip.folder}: ${skip.reason}`);
      if (!remove && list.length > 0) out.info(c.dim(`  ${toPosixRelative(ctx.root, zone)}`));
    },
  };
};
