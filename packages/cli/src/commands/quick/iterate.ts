import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import {
  type AnyBlueprint,
  applyBlueprintPatch,
  applyContentPatch,
  BlueprintPatchError,
  blueprintIdentity,
  blueprintKind,
  encodeBlueprintShare,
  isAppBlueprint,
  latestSchemaVersion,
  parseBlueprint,
  ShareLinkTooLargeError,
} from '@protoyard/blueprint';
import { z } from 'zod';
import { sha256Text } from '../../lib/checksum.ts';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag, opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { toPosixRelative } from '../../lib/paths.ts';
import { writeQuickAtomic } from '../../lib/quick/atomic-write.ts';
import { parseQuickBlueprint, quickPlayerPage } from '../../lib/quick/blueprint-kind.ts';
import { readQuickRecord, touchQuickRecord, writeQuickRecord } from '../../lib/quick/model.ts';
import { quickPlayerDir } from '../../lib/quick/paths.ts';
import { launcherHtml } from './index.ts';
import { type QuickServeTarget, resolveQuickServeTarget } from './serve.ts';

/**
 * `protoyard quick iterate <dir> --patch <file|-> [--allow-drop]` and
 * `quick undo <dir>`: change an exploration's blueprint with an RFC 6902 JSON
 * Patch (`applyBlueprintPatch`), and take the last change back.
 *
 * - The patch is untrusted input: size-capped before parsing, then applied
 *   and validated in memory. Nothing is written until the patched blueprint is
 *   valid, so an invalid patch changes nothing.
 * - When the patch changes the stored data shape, the previous blueprint goes
 *   into the blueprint's own `history` (as `generate` does), so a player
 *   opened with `?keep=<name>` upgrades its world with the same data-only
 *   migration a generated prototype would run. `world.preserved` says whether
 *   that migration keeps every row (false only with `--allow-drop`).
 * - Every change is recorded in `history/NNNN.json` with the patch, the exact
 *   previous blueprint.json text, and the before and after sha256. `undo`
 *   restores that text byte for byte, then removes the entry.
 * - Every file is written to a temporary file and renamed, so a served player
 *   never reads a half-written blueprint.
 * - A deck, page or doc is patched with `applyContentPatch`: validated as an
 *   untrusted document, its kind fixed. Content kinds share one store layout,
 *   so there is no migration and the world is always preserved (schema v1).
 */

/** Cap on a patch file or stdin, checked before parsing (1000 operations fit easily). */
export const QUICK_PATCH_MAX_BYTES = 512 * 1024;
export const QUICK_HISTORY_DIR = 'history';
const HISTORY_FORMAT = 'protoyard.quick-history';
/** Cap on one history entry: the previous blueprint plus the patch. */
const HISTORY_ENTRY_MAX_BYTES = 4 * 1024 * 1024;
const HISTORY_FILE = /^(\d{4})\.json$/;
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const HistoryEntrySchema = z
  .object({
    format: z.literal(HISTORY_FORMAT),
    formatVersion: z.literal(1),
    sequence: z.number().int().min(1).max(9999),
    at: z.iso.datetime({ offset: true }),
    patch: z.array(z.unknown()),
    allowDrop: z.boolean(),
    before: z.object({ sha256: Sha256, identitySha256: Sha256, text: z.string() }).strict(),
    after: z.object({ sha256: Sha256, identitySha256: Sha256 }).strict(),
    world: z
      .object({
        preserved: z.boolean(),
        fromVersion: z.number().int().positive(),
        toVersion: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export interface QuickWorldReport {
  /**
   * True when the data-only migration keeps every row. With the default
   * content-addressed storage the player opens a changed blueprint as a new
   * world; with `?keep=<name>` it migrates the kept world.
   */
  preserved: boolean;
  fromVersion: number;
  toVersion: number;
  /** The upgrade steps of the new database version, or [] when storage is unchanged. */
  ops: string[];
}

/** Where `quick iterate --patch -` reads. Tests swap it. */
let patchStdin: Readable = process.stdin;
export function setQuickIterateStdin(stream: Readable): () => void {
  const previous = patchStdin;
  patchStdin = stream;
  return () => {
    patchStdin = previous;
  };
}

const tooLarge = () =>
  new CliError('validation', `The patch is larger than ${QUICK_PATCH_MAX_BYTES} bytes.`, {
    hint: 'Split it into smaller patches and run quick iterate once per patch.',
  });

async function readPatchText(source: string): Promise<string> {
  if (source === '-') {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of patchStdin) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
      size += buffer.byteLength;
      if (size > QUICK_PATCH_MAX_BYTES) throw tooLarge();
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const path = resolve(process.cwd(), source);
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile()) {
    throw new CliError('not_found', `Patch file not found: ${source}`, {
      hint: 'Pass a regular JSON file (symlinks and folders are refused), or - for stdin.',
    });
  }
  if (info.size > QUICK_PATCH_MAX_BYTES) throw tooLarge();
  return readFile(path, 'utf8');
}

const toUrlPath = (from: string, to: string) => relative(from, to).split(sep).join('/');

/** The previous blueprint, without its own history (what a history entry stores). */
function withoutHistory(blueprint: AnyBlueprint): Record<string, unknown> {
  if (!isAppBlueprint(blueprint)) return { ...blueprint };
  const { history: _history, ...rest } = blueprint;
  return rest;
}

/** Writes blueprint.json, the standalone player's copy and the launcher for `text`. */
async function writeExploration(
  target: QuickServeTarget,
  blueprint: AnyBlueprint,
  text: string,
  seed: string | null
): Promise<void> {
  const seedParam = seed === null ? '' : `seed=${seed}`;
  let href: string;
  if (target.layout === 'standalone') {
    const playerDir = join(target.dir, 'player');
    href = `${toUrlPath(target.dir, join(playerDir, quickPlayerPage(blueprint, playerDir)))}?${seedParam ? `${seedParam}&` : ''}src=./blueprint.json`;
    await writeQuickAtomic(join(playerDir, 'blueprint.json'), text);
  } else {
    let share: string;
    try {
      share = await encodeBlueprintShare(blueprint);
    } catch (error) {
      if (!(error instanceof ShareLinkTooLargeError)) throw error;
      throw new CliError('validation', 'The changed blueprint is too large for a #bp= link.', {
        hint: 'Recreate the exploration with --standalone, then iterate on it.',
      });
    }
    const playerDir = quickPlayerDir(dirname(target.dir), target.playerVersion);
    href = `${toUrlPath(target.dir, join(playerDir, quickPlayerPage(blueprint, playerDir)))}${seedParam ? `?${seedParam}` : ''}#bp=${share}`;
  }
  // The blueprint lands last but one, the launcher last: a reader sees either
  // the old pair or the new blueprint with a launcher that soon follows.
  await writeQuickAtomic(join(target.dir, 'blueprint.json'), text);
  await writeQuickAtomic(join(target.dir, 'index.html'), launcherHtml(blueprint.name, href));
}

async function historyEntries(dir: string): Promise<number[]> {
  const names = await readdir(join(dir, QUICK_HISTORY_DIR)).catch(() => [] as string[]);
  return names
    .map((name) => HISTORY_FILE.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

const historyPath = (dir: string, sequence: number) =>
  join(dir, QUICK_HISTORY_DIR, `${String(sequence).padStart(4, '0')}.json`);

async function resolveTarget(ctx: { root: string }, target: string) {
  const resolved = await resolveQuickServeTarget({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    target,
  });
  const record = await readQuickRecord(resolved.dir);
  const text = await readFile(join(resolved.dir, 'blueprint.json'), 'utf8');
  // resolveQuickServeTarget already checked this text's identity against quick.json.
  const blueprint = await parseQuickBlueprint(JSON.parse(text) as unknown);
  return { target: resolved, record, text, blueprint };
}

export const quickIterateCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const patchSource = opt(options, 'patch');
  if (patchSource === undefined) {
    throw new CliError('usage', 'Missing --patch <file|->.', {
      hint: 'protoyard quick iterate <exploration> --patch change.json   (an RFC 6902 JSON Patch)',
    });
  }
  const {
    target,
    record,
    text: beforeText,
    blueprint: before,
  } = await resolveTarget(ctx, args[0] ?? '');
  const patchText = await readPatchText(patchSource);
  let patch: unknown;
  try {
    patch = JSON.parse(patchText);
  } catch (error) {
    throw new CliError('validation', `The patch is not valid JSON: ${(error as Error).message}`);
  }
  const allowDrop = flag(options, 'allowDrop');
  // A content kind has one store layout: always schema v1, never a migration.
  const fromVersion = isAppBlueprint(before) ? latestSchemaVersion(before) : 1;

  // Applied to the blueprint without its history; quick iterate owns `history`.
  let result: {
    blueprint: AnyBlueprint;
    migration: ReturnType<typeof applyBlueprintPatch>['migration'];
    destructive: boolean;
  };
  try {
    result = isAppBlueprint(before)
      ? applyBlueprintPatch(parseBlueprint(withoutHistory(before)), patch, {
          allowDrop,
          fromVersion,
        })
      : { ...(await applyContentPatch(before, patch)), migration: null, destructive: false };
  } catch (error) {
    if (!(error instanceof BlueprintPatchError)) throw error;
    throw new CliError('validation', error.message, {
      hint:
        error.code === 'drop-requires-allow'
          ? 'Re-run with --allow-drop to accept losing that data.'
          : error.index !== null
            ? `Operation ${error.index} failed (${error.code}).`
            : undefined,
      data: {
        code: error.code,
        index: error.index,
        ...(error.issues.length > 0 ? { issues: error.issues.slice(0, 20) } : {}),
      },
    });
  }
  if (isAppBlueprint(result.blueprint) && result.blueprint.history.length > 0) {
    throw new CliError('validation', 'A patch may not write "history"; quick iterate keeps it.', {
      data: { code: 'invalid-patch', index: null },
    });
  }
  const history = [
    ...(isAppBlueprint(before) ? before.history : []),
    ...(result.migration
      ? [
          {
            schemaVersion: fromVersion,
            blueprint: withoutHistory(before),
            ...(result.destructive ? { migrateNext: { allowDrop: true } } : {}),
          },
        ]
      : []),
  ];
  const after: AnyBlueprint = isAppBlueprint(result.blueprint)
    ? parseBlueprint({ ...result.blueprint, history })
    : result.blueprint;
  const toVersion = isAppBlueprint(after) ? latestSchemaVersion(after) : 1;
  if (toVersion !== (result.migration?.version ?? fromVersion)) {
    throw new CliError(
      'failure',
      `The changed blueprint rebuilds schema v${toVersion}, expected v${result.migration?.version ?? fromVersion}.`
    );
  }
  const afterText = `${JSON.stringify(after, null, 2)}\n`;
  const [beforeIdentity, afterIdentity] = await Promise.all([
    blueprintIdentity(before),
    blueprintIdentity(after),
  ]);
  const world: QuickWorldReport = {
    preserved: !result.destructive,
    fromVersion,
    toVersion,
    ops: (result.migration?.ops ?? []).map((op) =>
      op.op === 'copyTable' ? `copyTable ${op.from} → ${op.to}` : `${op.op} ${op.table}`
    ),
  };
  const changed = afterIdentity.sha256 !== beforeIdentity.sha256;

  const sequences = await historyEntries(target.dir);
  const sequence = (sequences.at(-1) ?? 0) + 1;
  if (changed && sequence > 9999) {
    throw new CliError('conflict', 'This exploration has 9999 recorded changes.', {
      hint: 'Promote it, or start a new exploration from its blueprint.json.',
    });
  }
  let entryFile: string | null = null;
  if (changed) {
    const entry: HistoryEntry = HistoryEntrySchema.parse({
      format: HISTORY_FORMAT,
      formatVersion: 1,
      sequence,
      at: new Date().toISOString(),
      patch,
      allowDrop,
      before: {
        sha256: sha256Text(beforeText),
        identitySha256: beforeIdentity.sha256,
        text: beforeText,
      },
      after: { sha256: sha256Text(afterText), identitySha256: afterIdentity.sha256 },
      world: { preserved: world.preserved, fromVersion, toVersion },
    });
    // The history entry first: whatever happens next, undo can restore the old text.
    await mkdir(join(target.dir, QUICK_HISTORY_DIR), { recursive: true });
    entryFile = historyPath(target.dir, sequence);
    await writeQuickAtomic(entryFile, `${JSON.stringify(entry, null, 2)}\n`);
    await writeExploration(target, after, afterText, record.seed);
    await writeQuickRecord(target.dir, {
      ...touchQuickRecord(record),
      blueprintSha256: afterIdentity.sha256,
    });
  }

  const data = {
    slug: target.slug,
    kind: blueprintKind(after),
    dir: toPosixRelative(ctx.root, target.dir),
    changed,
    history: entryFile ? toPosixRelative(ctx.root, entryFile) : null,
    before: { sha256: sha256Text(beforeText), identitySha256: beforeIdentity.sha256 },
    after: { sha256: sha256Text(afterText), identitySha256: afterIdentity.sha256 },
    world,
  };
  return {
    data,
    render(out) {
      const { c } = out;
      if (!changed) {
        out.always(`${mark(c, 'skip')} The patch leaves ${c.bold(target.slug)} unchanged.`);
        return;
      }
      out.always(`${mark(c, 'pass')} Patched ${c.bold(target.slug)} (${data.history})`);
      out.info(
        world.fromVersion === world.toVersion
          ? `  Storage unchanged (schema v${world.toVersion}).`
          : `  Schema v${world.fromVersion} → v${world.toVersion}: ${world.ops.join(', ') || 'new stores'}.`
      );
      out.info(
        world.preserved
          ? c.dim('  The world is preserved: a player opened with ?keep=<name> keeps its data.')
          : c.yellow('  The world is not preserved: the migration drops data (--allow-drop).')
      );
    },
  };
};

export const quickUndoCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  const { target, record, text: currentText } = await resolveTarget(ctx, args[0] ?? '');
  const sequences = await historyEntries(target.dir);
  const sequence = sequences.at(-1);
  if (sequence === undefined) {
    throw new CliError('not_found', `${target.slug} has no change to undo.`, {
      hint: 'quick undo takes back changes made with quick iterate.',
    });
  }
  const file = historyPath(target.dir, sequence);
  const info = await lstat(file);
  if (!info.isFile() || info.size > HISTORY_ENTRY_MAX_BYTES) {
    throw new CliError('unsafe_path', `Refusing ${toPosixRelative(ctx.root, file)}.`);
  }
  let entry: HistoryEntry;
  try {
    entry = HistoryEntrySchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    throw new CliError('validation', `${toPosixRelative(ctx.root, file)} is not a valid entry.`);
  }
  if (sha256Text(currentText) !== entry.after.sha256) {
    throw new CliError(
      'conflict',
      `blueprint.json changed after change ${sequence}; refusing to undo over it.`,
      { hint: 'Restore that change first, or start a new exploration.' }
    );
  }
  if (sha256Text(entry.before.text) !== entry.before.sha256) {
    throw new CliError('validation', `Change ${sequence} does not match its recorded hash.`);
  }
  let restored: AnyBlueprint;
  try {
    restored = await parseQuickBlueprint(JSON.parse(entry.before.text) as unknown);
  } catch {
    throw new CliError('validation', `Change ${sequence} holds an invalid blueprint.`);
  }
  const identity = await blueprintIdentity(restored);
  if (identity.sha256 !== entry.before.identitySha256) {
    throw new CliError('validation', `Change ${sequence} does not match its recorded identity.`);
  }
  await writeExploration(target, restored, entry.before.text, record.seed);
  await writeQuickRecord(target.dir, {
    ...touchQuickRecord(record),
    blueprintSha256: identity.sha256,
  });
  await rm(file);
  const world: QuickWorldReport = {
    // Going back to a lower schema version cannot reopen a kept world that already upgraded.
    preserved: entry.world.fromVersion === entry.world.toVersion,
    fromVersion: entry.world.toVersion,
    toVersion: entry.world.fromVersion,
    ops: [],
  };
  const data = {
    slug: target.slug,
    kind: blueprintKind(restored),
    dir: toPosixRelative(ctx.root, target.dir),
    undone: sequence,
    remaining: sequences.length - 1,
    sha256: entry.before.sha256,
    world,
  };
  return {
    data,
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Undid change ${sequence} of ${c.bold(target.slug)} (${data.remaining} left)`
      );
      if (!world.preserved)
        out.info(
          c.yellow(
            `  The schema goes back from v${world.fromVersion} to v${world.toVersion}: a kept world starts over.`
          )
        );
    },
  };
};
