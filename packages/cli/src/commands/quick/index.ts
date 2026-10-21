import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import {
  type Blueprint,
  blueprintFromBrief,
  blueprintIdentity,
  DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS,
  encodeBlueprintShare,
  loadUntrustedBlueprint,
  ShareLinkTooLargeError,
} from '@protoyard/blueprint';
import { checkSlug } from '@protoyard/core';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag, opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { QUICK_MARKER } from '../../lib/output-guard.ts';
import { toPosixRelative } from '../../lib/paths.ts';
import { createQuickRecord, writeQuickRecord } from '../../lib/quick/model.ts';
import { resolveQuickDir } from '../../lib/quick/paths.ts';
import {
  type LocatePlayerOptions,
  locatePlayerAssets,
  materializePlayer,
  type PlayerAssets,
} from '../../lib/quick/player-assets.ts';

/**
 * `protoyard quick "<brief>" | - | --blueprint <file>` (ADR-031): a disposable
 * exploration in seconds, with no build and no install. It synthesizes the
 * blueprint offline from a brief (or loads one as untrusted input), then
 * writes into a confined folder:
 *
 *   blueprint.json   the blueprint (canonical copy)
 *   quick.json       the exploration record (hashes, player version, seed)
 *   index.html       a script-free launcher that opens the player on it
 *   .protoyard-quick the marker that makes the folder ours
 *
 * The prebuilt player is shared per version (`.protoyard/quick/_player/<v>/`)
 * and the launcher hands it the blueprint as a `#bp=` share link. With
 * `--standalone`, a custom `--out`, or a blueprint too large for a link, the
 * player is copied into `<dir>/player/` next to its own `blueprint.json`, so
 * the folder is self-contained.
 */

/** A brief read from the argument or stdin; the synthesizer reads the first 5,000 characters. */
export const QUICK_MAX_BRIEF_BYTES = 64 * 1024;
const MAX_BLUEPRINT_BYTES = DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes;
const SEED = /^\d{1,10}$/;

/** Finds the prebuilt player. Tests swap it for a fixture player. */
let locatePlayer: (options: LocatePlayerOptions) => PlayerAssets = locatePlayerAssets;
export function setQuickPlayerLocator(
  locator: (options: LocatePlayerOptions) => PlayerAssets
): () => void {
  const previous = locatePlayer;
  locatePlayer = locator;
  return () => {
    locatePlayer = previous;
  };
}

/** Where `quick -` reads its brief. Tests swap it. */
let quickStdin: Readable & { isTTY?: boolean } = process.stdin;
export function setQuickStdin(stream: Readable & { isTTY?: boolean }): () => void {
  const previous = quickStdin;
  quickStdin = stream;
  return () => {
    quickStdin = previous;
  };
}

async function readStdin(stream: Readable): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.byteLength;
    if (size > QUICK_MAX_BRIEF_BYTES)
      throw new CliError('validation', 'The brief on stdin is larger than 64 KB.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readBlueprintFile(file: string): Promise<Blueprint> {
  const path = resolve(process.cwd(), file);
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile()) {
    throw new CliError('not_found', `Blueprint file not found: ${file}`, {
      hint: 'Pass a regular JSON file (symlinks and folders are refused).',
    });
  }
  if (info.size > MAX_BLUEPRINT_BYTES) {
    throw new CliError(
      'validation',
      `The blueprint is ${info.size} bytes; the limit is ${MAX_BLUEPRINT_BYTES}.`,
      {
        hint: 'Split the idea into a smaller blueprint.',
      }
    );
  }
  const result = loadUntrustedBlueprint(await readFile(path, 'utf8'));
  if (!result.success) {
    const shown = result.issues.slice(0, 10);
    throw new CliError(
      'validation',
      `The blueprint is invalid (${result.issues.length} issue${result.issues.length === 1 ? '' : 's'}): ${shown
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
      { hint: shown.map((issue) => issue.fix).join(' '), data: { issues: result.issues } }
    );
  }
  return result.blueprint;
}

/** `Field Visits Tracker` → `field-visits-tracker` (a valid slug, or null). */
export function slugFromName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    // Drop the combining accents NFKD splits off (é → e), then dash the rest.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const candidate = /^[a-z]/.test(slug) ? slug : `idea-${slug}`;
  return checkSlug(candidate).ok ? candidate : null;
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A static page that opens the player: no script (it works under the
 * player's CSP and from any static host), a meta refresh plus a visible link.
 */
export function launcherHtml(name: string, href: string): string {
  const safeHref = escapeAttribute(href);
  const title = escapeAttribute(name);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${safeHref}">
<title>${title}</title>
</head>
<body>
<p>Opening <a href="${safeHref}">${title}</a> in the Protoyard player. Simulated data only.</p>
</body>
</html>
`;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

const toUrlPath = (from: string, to: string) => relative(from, to).split(sep).join('/');

export interface QuickResult {
  slug: string;
  dir: string;
  blueprintSha256: string;
  ready: boolean;
  source: 'brief' | 'blueprint';
  name: string;
  layout: 'shared' | 'standalone';
  /** Why the folder is standalone (`flag`, `out`, `too-large-for-link`), or null. */
  standaloneReason: 'flag' | 'out' | 'too-large-for-link' | null;
  player: { version: string; dir: string; reused: boolean };
  /** The launcher page, relative to the workspace. */
  open: string;
  replaced: boolean;
  /** Archetype and inference notes from the brief synthesizer. */
  rationale: string[];
}

export const quickCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult<QuickResult>> => {
  const blueprintFile = opt(options, 'blueprint');
  const briefArg = args[0];
  if ((blueprintFile === undefined) === (briefArg === undefined)) {
    throw new CliError(
      'usage',
      'Give a brief, "-" to read it from stdin, or --blueprint <file> (one of them).',
      {
        hint: 'Example: protoyard quick "A booking app for a fictional climbing gym"',
      }
    );
  }
  const seed = opt(options, 'seed');
  if (seed !== undefined && (!SEED.test(seed) || Number(seed) > 4_294_967_295)) {
    throw new CliError(
      'usage',
      `--seed must be a whole number from 0 to 4294967295 (got "${seed}").`
    );
  }

  let blueprint: Blueprint;
  let brief: string | undefined;
  let rationale: string[] = [];
  if (blueprintFile !== undefined) {
    blueprint = await readBlueprintFile(blueprintFile);
  } else {
    const text = briefArg === '-' ? await readStdin(quickStdin) : (briefArg as string);
    if (Buffer.byteLength(text) > QUICK_MAX_BRIEF_BYTES) {
      throw new CliError('validation', 'The brief is larger than 64 KB.', {
        hint: 'Describe the idea in a few sentences.',
      });
    }
    brief = text.trim();
    if (brief === '') {
      throw new CliError('usage', 'The brief is empty.', {
        hint: 'Describe who uses the product and what they track, in a sentence or two.',
      });
    }
    const name = opt(options, 'name');
    let result: ReturnType<typeof blueprintFromBrief>;
    try {
      result = blueprintFromBrief(brief, name ? { name } : {});
    } catch (error) {
      // The synthesizer validates its own output; report a miss as data, never a crash.
      const issues = (error as { issues?: { path?: (string | number)[]; message?: string }[] })
        .issues;
      const detail = Array.isArray(issues)
        ? issues
            .slice(0, 5)
            .map(
              (issue) =>
                `${(issue.path ?? []).join('.') || '(root)'}: ${issue.message ?? 'invalid'}`
            )
            .join('; ')
        : error instanceof Error
          ? error.message
          : String(error);
      throw new CliError('validation', `The brief produced an invalid blueprint: ${detail}`, {
        hint: 'Rephrase the brief (for example, name the people "customers" or "climbers"), or start from --blueprint <file>.',
        ...(Array.isArray(issues) ? { data: { issues } } : {}),
      });
    }
    blueprint = result.blueprint;
    rationale = result.rationale;
  }

  const slug = opt(options, 'slug') ?? slugFromName(blueprint.name);
  if (!slug) {
    throw new CliError('usage', `Could not derive a slug from "${blueprint.name}".`, {
      hint: 'Pass --slug my-idea.',
    });
  }
  const out = opt(options, 'out');
  const quick = resolveQuickDir({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    slug,
    ...(out !== undefined ? { out } : {}),
    allowExternal: flag(options, 'allowExternalOut'),
  });
  if (quick.state === 'marked' && !flag(options, 'force')) {
    throw new CliError(
      'conflict',
      `An exploration already exists at ${toPosixRelative(ctx.root, quick.dir)}.`,
      {
        hint: 'Pass --force to replace it, or choose another --slug.',
      }
    );
  }

  const identity = await blueprintIdentity(blueprint);
  const assets = locatePlayer({ workspaceRoot: ctx.root });
  let standaloneReason: QuickResult['standaloneReason'] = flag(options, 'standalone')
    ? 'flag'
    : quick.custom
      ? 'out'
      : null;
  let share: string | null = null;
  if (standaloneReason === null) {
    try {
      share = await encodeBlueprintShare(blueprint);
    } catch (error) {
      if (!(error instanceof ShareLinkTooLargeError)) throw error;
      standaloneReason = 'too-large-for-link';
    }
  }
  const standalone = standaloneReason !== null;

  await mkdir(quick.dir, { recursive: true });
  const player = await materializePlayer(
    assets,
    standalone ? { kind: 'exploration', dir: quick.dir } : { kind: 'shared', zone: quick.zone }
  );
  const json = `${JSON.stringify(blueprint, null, 2)}\n`;
  await writeAtomic(join(quick.dir, 'blueprint.json'), json);
  const params = `?${seed !== undefined ? `seed=${seed}&` : ''}`;
  let href: string;
  if (standalone) {
    await writeAtomic(join(player.dir, 'blueprint.json'), json);
    href = `${toUrlPath(quick.dir, join(player.dir, 'index.html'))}${params}src=./blueprint.json`;
  } else {
    href = `${toUrlPath(quick.dir, join(player.dir, 'index.html'))}${params.replace(/[?&]$/, '')}#bp=${share}`;
  }
  await writeAtomic(join(quick.dir, 'index.html'), launcherHtml(blueprint.name, href));

  const record = createQuickRecord({
    slug,
    ...(brief !== undefined ? { brief, storeBrief: options.storeBrief !== false } : {}),
    blueprintSha256: identity.sha256,
    seed: seed ?? null,
    player: { version: player.version, standalone },
  });
  await writeQuickRecord(quick.dir, record);
  await writeAtomic(
    join(quick.dir, QUICK_MARKER),
    `${JSON.stringify({ format: 'protoyard.quick-marker', slug }, null, 2)}\n`
  );

  const rel = (path: string) => toPosixRelative(ctx.root, path);
  const data: QuickResult = {
    slug,
    dir: rel(quick.dir),
    blueprintSha256: identity.sha256,
    ready: true,
    source: brief !== undefined ? 'brief' : 'blueprint',
    name: blueprint.name,
    layout: standalone ? 'standalone' : 'shared',
    standaloneReason,
    player: { version: player.version, dir: rel(player.dir), reused: player.reused },
    open: rel(join(quick.dir, 'index.html')),
    replaced: quick.state === 'marked',
    rationale,
  };
  return {
    data,
    render(output) {
      const { c } = output;
      output.always(`${mark(c, 'pass')} ${data.name} is ready in ${c.cyan(`${data.dir}/`)}`);
      output.info(
        `  blueprint  ${data.dir}/blueprint.json (${data.source === 'brief' ? 'from the brief' : 'validated'})`
      );
      output.info(
        `  player     ${data.player.dir} (${data.player.version}, ${data.layout}${
          data.standaloneReason === 'too-large-for-link' ? ': too large for a share link' : ''
        }${data.player.reused ? ', reused' : ''})`
      );
      output.always(
        `  open       ${data.open} (serve the workspace over http; browsers block modules from file://)`
      );
      if (data.rationale.length > 0)
        output.info(c.dim(`  ${data.rationale.slice(0, 3).join(' · ')}`));
    },
  };
};
