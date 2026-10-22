import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import {
  type AnyBlueprint,
  type AppBriefResult,
  ARCHETYPE_IDS,
  blueprintFromBrief,
  blueprintKind,
  brandLibraryThemeId,
  isAppBlueprint,
  isAppBriefResult,
  latestSchemaVersion,
  MAX_BRIEF_LENGTH,
  safeParseAnyBlueprint,
  safeParseBlueprint,
} from '@protoyard/blueprint';
import { type CommandResult, flag, type Handler, opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { canonicalPath, isInside } from '../lib/paths.ts';
import { packageExportFile, protoyardPackageDir } from '../lib/workspace.ts';
import { generateCommand } from './generate.ts';

/**
 * `protoyard blueprint validate <file>`: checks a blueprint without
 * generating anything. Exit 0 when valid, 4 with every path-specific issue
 * otherwise. Reads JSON only.
 */
export const blueprintValidateCommand: Handler = async (_ctx, args): Promise<CommandResult> => {
  const file = args[0];
  if (!file) {
    throw new CliError('usage', 'Missing <file>.', {
      hint: 'Example: pnpm protoyard blueprint validate ./helpdesk.blueprint.json',
    });
  }
  const path = resolve(process.cwd(), file);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new CliError('not_found', `Blueprint file not found: ${file}`);
  if (info.size > 1024 * 1024) {
    throw new CliError('validation', `Blueprint file is larger than 1 MB: ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CliError('validation', `Blueprint is not valid JSON: ${(error as Error).message}`, {
      data: { file, valid: false, issues: [{ path: '(root)', message: (error as Error).message }] },
    });
  }
  const parsed = await safeParseAnyBlueprint(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    }));
    throw new CliError(
      'validation',
      `Invalid blueprint (${issues.length} issue${issues.length === 1 ? '' : 's'}): ${issues
        .map((i) => `${i.path} — ${i.message}`)
        .join('; ')}`,
      { data: { file, valid: false, issues } }
    );
  }
  const blueprint = parsed.data;
  const kind = blueprintKind(blueprint);
  let schemaVersion: number;
  try {
    schemaVersion = isAppBlueprint(blueprint) ? latestSchemaVersion(blueprint) : 1;
  } catch (error) {
    throw new CliError(
      'validation',
      `Blueprint history does not rebuild: ${(error as Error).message}`,
      {
        data: {
          file,
          valid: false,
          issues: [{ path: 'history', message: (error as Error).message }],
        },
      }
    );
  }
  if (blueprint.brand) {
    try {
      brandLibraryThemeId(blueprint.brand);
    } catch (error) {
      const message = (error as Error).message;
      throw new CliError('validation', `Invalid blueprint brand: ${message}`, {
        data: { file, valid: false, issues: [{ path: 'brand.libraryTheme', message }] },
      });
    }
  }
  const summary = blueprintSummary(blueprint);
  return {
    data: {
      file,
      valid: true,
      kind,
      name: blueprint.name,
      ...summary,
      schemaVersion,
      issues: [],
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} ${c.bold(blueprint.name)} is a valid ${kind} blueprint: ${summaryText(kind, summary)}, schema v${schemaVersion}`
      );
      if (kind === 'app' && 'entities' in summary) {
        for (const e of summary.entities) out.info(`  ${e.name} ${c.dim(`(${e.fields} fields)`)}`);
      }
    },
  };
};

type BlueprintSummary =
  | { entities: { name: string; fields: number }[]; roles: string[]; screens: number }
  | { slides: number; blocks: number; interactiveBlocks: number }
  | { sections: number; forms: number }
  | { sections: number; headings: number };

const INTERACTIVE_BLOCKS = new Set([
  'tabs',
  'reveal',
  'poll',
  'quiz',
  'calculator',
  'counter',
  'chart-controls',
  'map',
  'embed-app',
  'form',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function forEachBlueprintBlock(
  value: unknown,
  visit: (block: Record<string, unknown>) => void
): void {
  if (Array.isArray(value)) {
    for (const child of value) forEachBlueprintBlock(child, visit);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.type === 'string') visit(value);
  forEachBlueprintBlock(value.blocks, visit);
  forEachBlueprintBlock(value.columns, visit);
  forEachBlueprintBlock(value.panels, visit);
}

function countBlockStats(lists: readonly unknown[]): {
  blocks: number;
  interactiveBlocks: number;
} {
  let blocks = 0;
  let interactiveBlocks = 0;
  for (const list of lists)
    forEachBlueprintBlock(list, (block) => {
      blocks += 1;
      if (INTERACTIVE_BLOCKS.has(block.type as string)) interactiveBlocks += 1;
    });
  return { blocks, interactiveBlocks };
}

function countBlocksOfType(value: unknown, target: string): number {
  let count = 0;
  forEachBlueprintBlock(value, (block) => {
    if (block.type === target) count += 1;
  });
  return count;
}

function blueprintSummary(blueprint: AnyBlueprint): BlueprintSummary {
  if (isAppBlueprint(blueprint)) {
    return {
      entities: blueprint.entities.map((entity) => ({
        name: entity.name,
        fields: entity.fields.length,
      })),
      roles: blueprint.roles.map((role) => role.name),
      screens: blueprint.screens.length,
    };
  }
  if (blueprint.kind === 'deck') {
    const { blocks, interactiveBlocks } = countBlockStats(
      blueprint.deck.slides.flatMap((slide) => ('blocks' in slide ? [slide.blocks] : []))
    );
    return { slides: blueprint.deck.slides.length, blocks, interactiveBlocks };
  }
  if (blueprint.kind === 'page') {
    let forms = 0;
    for (const section of blueprint.page.sections) {
      forms += countBlocksOfType(section.blocks, 'form');
    }
    return { sections: blueprint.page.sections.length, forms };
  }
  let headings = 0;
  let sections = 0;
  forEachBlueprintBlock(blueprint.doc.blocks, (block) => {
    if (block.type !== 'heading') return;
    headings += 1;
    if ((block.level ?? 2) === 2) sections += 1;
  });
  return { sections, headings };
}

function summaryText(kind: ReturnType<typeof blueprintKind>, summary: BlueprintSummary): string {
  if (kind === 'app' && 'entities' in summary)
    return `${summary.entities.length} entities, ${summary.roles.length} roles, ${summary.screens} screens`;
  if (kind === 'deck' && 'slides' in summary)
    return `${summary.slides} slides, ${summary.blocks} blocks, ${summary.interactiveBlocks} interactive`;
  if (kind === 'page' && 'forms' in summary)
    return `${summary.sections} sections, ${summary.forms} forms`;
  if ('headings' in summary) return `${summary.sections} sections, ${summary.headings} headings`;
  return '';
}

/** Where `blueprint new` reads a piped brief and asks interactive questions. Tests swap it. */
export interface BriefIo {
  stdin: Readable & { isTTY?: boolean };
  /** Prompts go here (stderr by default, so `--json` stdout stays parseable). */
  prompts: Writable;
}

let briefIo: BriefIo = { stdin: process.stdin, prompts: process.stderr };

/** Replaces the brief input and prompt streams; returns a function that restores them. */
export function setBriefIo(io: BriefIo): () => void {
  const previous = briefIo;
  briefIo = io;
  return () => {
    briefIo = previous;
  };
}

/** Upper bound on a brief read from a file or stdin (the synthesizer reads 5,000 characters). */
const MAX_BRIEF_BYTES = 64 * 1024;

async function readStdin(stream: Readable): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
    if (text.length > MAX_BRIEF_BYTES) {
      throw new CliError('validation', 'The brief on stdin is larger than 64 KB.');
    }
  }
  return text;
}

async function readBriefFile(file: string): Promise<string> {
  const path = resolve(process.cwd(), file);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new CliError('not_found', `Brief file not found: ${file}`);
  if (info.size > MAX_BRIEF_BYTES) {
    throw new CliError('validation', `Brief file is larger than 64 KB: ${file}`);
  }
  return readFile(path, 'utf8');
}

/** The questions `--interactive` asks, in order; answers become one brief. */
export const BRIEF_QUESTIONS = [
  'What are you building? (one sentence)',
  'Who uses it?',
  'What do they track? (for example: tickets and customers)',
  'What details matter for each? (for example: priority, due date, amount)',
  'Anything else: a map, a calendar, prices? (optional)',
  'Product name? (optional)',
  'Is it a mobile app? (y/N)',
] as const;

/** Asks `BRIEF_QUESTIONS` line by line; lines that arrive early are buffered, not lost. */
async function askBrief(io: BriefIo): Promise<{ brief: string; name?: string }> {
  const rl = createInterface({ input: io.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const answers: string[] = [];
  try {
    for (const question of BRIEF_QUESTIONS) {
      io.prompts.write(`? ${question} `);
      const next = await lines.next();
      answers.push(next.done ? '' : String(next.value).trim());
    }
  } finally {
    rl.close();
  }
  const [what = '', who = '', track = '', details = '', extra = '', name = '', mobile = ''] =
    answers;
  const sentence = (text: string) => (text && !/[.!?]$/.test(text) ? `${text}.` : text);
  const brief = [
    sentence(what),
    who ? sentence(`Used by ${who}`) : '',
    track ? sentence(`Track ${track}${details ? ` with ${details}` : ''}`) : '',
    sentence(extra),
    /^y(es)?$/i.test(mobile) ? 'A mobile app.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return name ? { brief, name } : { brief };
}

/**
 * `$schema` relative to the output file, when the workspace has the blueprint
 * schema: `@protoyard/blueprint/schema.json`, resolved from the output folder
 * and the root (an installed package's dist copy, or this repository's file).
 */
function schemaRef(root: string, target: string): string | undefined {
  const dir = protoyardPackageDir(root, 'blueprint', [dirname(target)]);
  const schema = dir ? packageExportFile(dir, './schema.json') : null;
  if (!schema) return undefined;
  const rel = relative(dirname(target), schema).split(sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** A dry run writes nothing, so only the always-refused targets fail it. */
const rethrowUnsafe = (error: unknown) => {
  if (error instanceof CliError && error.code === 'unsafe_path') throw error;
};

/** Workspace files `blueprint new` never writes, even with --force. */
const RESERVED_BASENAME = /^(?:package|protoyard|biome|tsconfig(?:\..*)?)\.json$/i;
/** Folders `blueprint new` never writes into: generated state, dependencies, generated code. */
const RESERVED_DIRS = ['.protoyard', 'node_modules'];

/**
 * Where `blueprint new` may write: never a workspace config file, generated
 * state, dependencies, `src/generated/` or a symbolic link. An existing file
 * is replaced only with --force, and only when it already is a valid
 * blueprint, so a wrong argument cannot destroy another JSON file.
 */
async function assertBlueprintTarget(
  root: string,
  target: string,
  file: string,
  force: boolean
): Promise<void> {
  // Canonical, so a linked parent folder cannot hide a reserved location.
  const segments = relative(canonicalPath(root), canonicalPath(target)).split(sep);
  const lower = segments.map((s) => s.toLowerCase());
  const underGenerated = lower.some((s, i) => s === 'src' && lower[i + 1] === 'generated');
  if (
    RESERVED_BASENAME.test(basename(target)) ||
    lower.some((s) => RESERVED_DIRS.includes(s)) ||
    underGenerated
  ) {
    throw new CliError('unsafe_path', `Refusing to write a blueprint over ${file}.`, {
      hint: 'Workspace config files, .protoyard/, node_modules/ and src/generated/ are never blueprint targets. Choose another file name.',
    });
  }
  const info = await lstat(target).catch(() => null);
  if (!info) return;
  if (info.isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to write through a symbolic link: ${file}`);
  }
  if (!force) {
    throw new CliError('conflict', `${file} already exists.`, {
      hint: 'Re-run with --force to replace it, or choose another file name.',
    });
  }
  let existing: unknown = null;
  if (info.isFile() && info.size <= 1024 * 1024) {
    try {
      existing = JSON.parse(await readFile(target, 'utf8'));
    } catch {
      existing = null;
    }
  }
  if (existing === null || !safeParseBlueprint(existing).success) {
    throw new CliError(
      'conflict',
      `${file} exists and is not a blueprint; --force only replaces blueprints.`,
      {
        hint: 'Choose another file name.',
      }
    );
  }
}

/**
 * `protoyard blueprint new <file> --from-brief <file|-> | --interactive`:
 * turns a product brief into a validated blueprint offline (same brief, same
 * file), prints the reasons for each choice, and with `--generate <slug>`
 * chains straight into `generate`. Never overwrites without `--force`.
 */
export const blueprintNewCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const file = args[0];
  if (!file) {
    throw new CliError('usage', 'Missing <file>.', {
      hint: 'Example: pnpm protoyard blueprint new ./salon.blueprint.json --from-brief brief.md',
    });
  }
  if (!file.endsWith('.json')) {
    throw new CliError('usage', `The blueprint file must end in .json: ${file}`);
  }
  const fromBrief = opt(options, 'fromBrief');
  const interactive = flag(options, 'interactive');
  if (fromBrief && interactive) {
    throw new CliError('usage', 'Use either --from-brief or --interactive, not both.');
  }
  if (!fromBrief && !interactive) {
    throw new CliError('usage', 'Missing a brief.', {
      hint: 'Pass --from-brief <file>, pipe one with --from-brief -, or use --interactive on a terminal.',
    });
  }
  const archetype = opt(options, 'archetype');
  if (archetype && !(ARCHETYPE_IDS as readonly string[]).includes(archetype)) {
    throw new CliError('usage', `Unknown archetype "${archetype}".`, {
      hint: `Choose one of: ${ARCHETYPE_IDS.join(', ')}.`,
    });
  }
  const dryRun = flag(options, 'dryRun');
  const generateSlug = opt(options, 'generate');

  const target = resolve(process.cwd(), file);
  const parent = dirname(target);
  const rootReal = await realpath(ctx.root);
  const parentReal = existsSync(parent) ? await realpath(parent) : parent;
  if (!isInside(rootReal, parentReal) || !isInside(ctx.root, target)) {
    throw new CliError('unsafe_path', `Refusing to write outside the workspace: ${file}`);
  }
  if (dryRun) await assertBlueprintTarget(rootReal, target, file, true).catch(rethrowUnsafe);
  else await assertBlueprintTarget(rootReal, target, file, flag(options, 'force'));

  let brief: string;
  let name = opt(options, 'name');
  if (interactive) {
    if (!briefIo.stdin.isTTY) {
      throw new CliError('usage', '--interactive needs a terminal.', {
        hint: 'Pipe the brief instead: echo "…" | pnpm protoyard blueprint new <file> --from-brief -',
      });
    }
    const answers = await askBrief(briefIo);
    brief = answers.brief;
    name ??= answers.name;
  } else {
    brief =
      fromBrief === '-' ? await readStdin(briefIo.stdin) : await readBriefFile(fromBrief as string);
  }
  if (brief.trim() === '') throw new CliError('usage', 'The brief is empty.');

  let result: AppBriefResult;
  try {
    const synthesized = blueprintFromBrief(brief, {
      ...(archetype ? { archetype } : {}),
      ...(name ? { name } : {}),
    });
    if (!isAppBriefResult(synthesized)) {
      throw new CliError(
        'validation',
        `This brief looks like a ${synthesized.kind}, and generate still expects an app blueprint.`,
        {
          hint: `Pass an app brief, or force an app with kind "app" once the CLI accepts --kind. Detector: ${synthesized.kindDetection.reason}`,
        }
      );
    }
    result = synthesized;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('validation', `Could not build a blueprint: ${(error as Error).message}`);
  }
  const ref = schemaRef(ctx.root, target);
  const json = { ...(ref ? { $schema: ref } : {}), ...result.json };
  const text = `${JSON.stringify(json, null, 2)}\n`;

  if (!dryRun) {
    await mkdir(parent, { recursive: true });
    await writeFile(target, text);
  }

  let generated: CommandResult | undefined;
  if (generateSlug) {
    // A dry run still needs a file to read: plan from a temporary copy.
    const scratch = dryRun ? await mkdtemp(join(tmpdir(), 'protoyard-brief-')) : undefined;
    const source = scratch ? join(scratch, 'blueprint.json') : target;
    try {
      if (scratch) await writeFile(source, text);
      generated = await generateCommand(ctx, [generateSlug], {
        blueprint: source,
        dryRun,
        ...(options.install === false ? { install: false } : {}),
      });
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }

  const { blueprint } = result;
  return {
    data: {
      file,
      written: !dryRun,
      archetype: result.archetype,
      layout: result.layout,
      name: blueprint.name,
      entities: blueprint.entities.map((e) => e.name),
      screens: blueprint.screens.map((s) => s.type),
      rationale: result.rationale,
      briefLength: Math.min(brief.length, MAX_BRIEF_LENGTH),
      ...(dryRun ? { blueprint: json } : {}),
      ...(generated ? { generate: generated.data } : {}),
    },
    ...(generated?.failure ? { failure: generated.failure } : {}),
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} ${dryRun ? 'Planned' : 'Wrote'} ${c.bold(file)}: ${c.bold(blueprint.name)} (${result.archetype}), ${blueprint.entities.length} entities, ${blueprint.screens.length} screens`
      );
      for (const line of result.rationale) out.info(`  ${c.dim('·')} ${line}`);
      if (!generateSlug && !dryRun) {
        out.info(
          `  Next: pnpm protoyard generate <slug> --blueprint ${file}  (or re-run with --generate <slug>)`
        );
      }
      generated?.render?.(out);
    },
  };
};
