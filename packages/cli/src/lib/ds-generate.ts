/**
 * `protoyard ds new --from-tokens | --from-css | --from-logo | --brief`
 * (PLAN_013 T-generator): the inputs of Texuli's design-system generator
 * (`generateDesignSystem`, `@texuli/tokens/design-system/generate`), read
 * from untrusted workspace files, a prose brief, or stdin.
 *
 * Every input is data: files are read as bytes inside the workspace (no
 * symlinks, no paths outside it) under a size cap, and nothing in them is
 * executed, fetched or rendered. Texuli's importers enforce their own caps
 * and refuse unsafe values. The result is always a draft document: an
 * `approval` section an input might carry is dropped before the document is
 * locked, so only `protoyard ds approve` can approve it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { DesignSystem } from '@protoyard/themes';
import type {
  DesignSystemGenerationReport,
  GenerateDesignSystemInput,
} from '@texuli/tokens/design-system/generate';
import { jsonErrorText } from './json-error.ts';
import { CliError } from './output.ts';
import { canonicalPath } from './paths.ts';
import { workspaceFile } from './workspace-file.ts';

/** The four generator sources; `ds new` takes at most one. */
export const GENERATOR_SOURCES = ['tokens', 'css', 'logo', 'brief'] as const;
export type GeneratorSource = (typeof GENERATOR_SOURCES)[number];

/** The `ds new` option that names each source. */
export const SOURCE_FLAGS: Record<GeneratorSource, string> = {
  tokens: '--from-tokens',
  css: '--from-css',
  logo: '--from-logo',
  brief: '--brief',
};

/** Size caps on each input, in bytes. Texuli's own JSON and CSS cap is 1 MiB. */
export const GENERATOR_LIMITS = {
  tokens: 1024 * 1024,
  css: 1024 * 1024,
  logo: 512 * 1024,
  brief: 16 * 1024,
  /** Brief clauses read at most. */
  clauses: 256,
  /** Color values read from an SVG at most. */
  svgColors: 4096,
} as const;

/** Where a `--brief -` is read from. Tests swap it. */
let briefStdin: Readable & { isTTY?: boolean } = process.stdin;

/** Replaces the stream `--brief -` reads; returns a function that restores it. */
export function setDsBriefStdin(stream: Readable & { isTTY?: boolean }): () => void {
  const previous = briefStdin;
  briefStdin = stream;
  return () => {
    briefStdin = previous;
  };
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MiB` : `${bytes / 1024} KiB`;
}

/**
 * A workspace file as bytes: inside the workspace after every symlink is
 * resolved, never a symlink itself, never hidden (no `.env`, `.git/…` or other
 * dot segment: secrets live there), a regular file, and at most `max` bytes.
 */
export function readWorkspaceInput(root: string, file: string, max: number, flag: string): Buffer {
  const path = workspaceFile(root, file);
  const segments = relative(canonicalPath(root), canonicalPath(path)).split(sep);
  if (segments.some((segment) => segment.startsWith('.'))) {
    throw new CliError('unsafe_path', `${flag}: refusing the hidden file ${file}.`, {
      hint: 'Hidden files and folders (.env, .git, …) are never generator inputs; copy the tokens, stylesheet or logo to a plain file.',
    });
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new CliError('not_found', `${flag}: no such file: ${file}.`);
  }
  if (statSync(path).size > max) {
    throw new CliError('validation', `${flag}: ${file} is larger than ${size(max)}.`);
  }
  const bytes = readFileSync(path);
  if (bytes.length > max) {
    throw new CliError('validation', `${flag}: ${file} is larger than ${size(max)}.`);
  }
  return bytes;
}

function utf8(bytes: Buffer, flag: string, file: string): string {
  const text = bytes.toString('utf8');
  if (text.includes('�')) {
    throw new CliError('validation', `${flag}: ${file} is not UTF-8 text.`);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readStdin(stream: Readable): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
    if (Buffer.byteLength(text) > GENERATOR_LIMITS.brief) {
      throw new CliError(
        'validation',
        `--brief -: the brief on stdin is larger than ${size(GENERATOR_LIMITS.brief)}.`
      );
    }
  }
  return text;
}

/** A brief file: a value with no spaces that ends in `.txt` or `.md`. */
const BRIEF_FILE = /^[^\s]+\.(?:txt|md)$/i;

/**
 * The `--brief` value as text: `-` reads stdin, a `*.txt` or `*.md` path
 * reads that workspace file, anything else is the brief itself.
 */
export async function readBrief(
  root: string,
  value: string
): Promise<{ text: string; from: 'text' | 'file' | 'stdin'; file?: string }> {
  if (value === '-') {
    if (briefStdin.isTTY) {
      throw new CliError(
        'usage',
        '--brief - reads the brief from stdin, and stdin is a terminal.',
        {
          hint: 'Pipe it: echo "calm fintech, brand #0f766e, font Inter" | protoyard ds new <id> --brief -',
        }
      );
    }
    return { text: await readStdin(briefStdin), from: 'stdin' };
  }
  if (BRIEF_FILE.test(value)) {
    const bytes = readWorkspaceInput(root, value, GENERATOR_LIMITS.brief, '--brief');
    return { text: utf8(bytes, '--brief', value), from: 'file', file: value };
  }
  if (Buffer.byteLength(value) > GENERATOR_LIMITS.brief) {
    throw new CliError('validation', `--brief is larger than ${size(GENERATOR_LIMITS.brief)}.`);
  }
  return { text: value, from: 'text' };
}

/** How one clause of a prose brief was read. */
export interface BriefReading {
  clause: string;
  /** The brand one-liner clauses it became; empty when nothing was read (an `unmapped` loss). */
  read: string[];
}

type ImportBrand = typeof import('@texuli/tokens/design-system/import').importBrand;

/** Sentence ends, clause punctuation, line breaks and a few joining words. */
const CLAUSE_SPLIT = /[.!?](?=\s|$)|[;,\n\r]|\s+(?:and|with|but|plus)\s+/i;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
/** {@link HEX} without the global flag (`test` keeps no state). */
const HEX_ONE = new RegExp(HEX.source, 'i');
const NAME = '([A-Z][\\w-]*(?:\\s+[A-Z0-9][\\w-]*){0,2})';
const HEADING_FONT = new RegExp(
  `\\b(?:[Hh]eading|[Dd]isplay|[Tt]itle)s?(?:\\s+(?:font|typeface))?\\s+(?:(?:in|use|uses|using|is|of)\\s+)?${NAME}`
);
const MONO_FONT = new RegExp(
  `\\b[Mm]ono(?:space)?(?:\\s+(?:font|typeface))?\\s+(?:(?:in|use|uses|using|is|of)\\s+)?${NAME}`
);
const BODY_FONT = new RegExp(`\\b(?:[Ff]ont|[Tt]ypeface)\\s+(?:(?:is|of)\\s+)?${NAME}`);
const FONT_AFTER = new RegExp(`${NAME}\\s+(?:font|typeface)\\b`);
const MOTION =
  /\b(none|subtle|standard|expressive)\s+motion\b|\bmotion\s+(none|subtle|standard|expressive)\b/i;
/** The brand one-liner's single words (shape, density, elevation, surface, calm motion). */
const WORDS = [
  'sharp',
  'rounded',
  'pill',
  'dense',
  'compact',
  'comfortable',
  'spacious',
  'flat',
  'soft',
  'crisp',
  'glow',
  'layered',
  'glass',
  'solid',
  'calm',
] as const;

/** The words Texuli's one-liner reads from a clause written as prose. */
function readProseClause(clause: string): string[] {
  const out: string[] = [];
  const lower = clause.toLowerCase();
  const colors = clause.match(HEX) ?? [];
  if (colors.length === 1) {
    const role = /\bsecondary\b/.test(lower)
      ? 'secondary'
      : /\baccent\b/.test(lower)
        ? 'accent'
        : /\b(?:brand|primary|seed|main)\b/.test(lower)
          ? 'brand'
          : '';
    out.push(role ? `${role} ${colors[0]}` : (colors[0] as string));
  } else {
    out.push(...colors);
  }
  const heading = HEADING_FONT.exec(clause);
  const mono = heading ? null : MONO_FONT.exec(clause);
  if (heading) out.push(`heading ${heading[1]}`);
  else if (mono) out.push(`mono ${mono[1]}`);
  else {
    const body = BODY_FONT.exec(clause) ?? FONT_AFTER.exec(clause);
    if (body) out.push(`font ${body[1]}`);
  }
  const motion = MOTION.exec(clause);
  if (motion) out.push(`motion ${(motion[1] ?? motion[2] ?? '').toLowerCase()}`);
  for (const word of WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) out.push(word);
  }
  if (/\bAAA\b/.test(clause)) out.push('AAA');
  else if (/\bAA\b/.test(clause)) out.push('AA');
  return out;
}

/**
 * A prose brief as Texuli's brand one-liner. Each clause without a color
 * that Texuli's `importBrand` reads (no `unmapped` loss) is kept as written;
 * any other clause is read for colors (with the role a nearby word names), fonts, shape, density,
 * elevation, surface, motion and contrast words. A clause with none of them
 * is kept, so Texuli reports it as an `unmapped` loss. Deterministic.
 */
export function readProseBrief(
  text: string,
  importBrand: ImportBrand
): { oneLiner: string; reading: BriefReading[] } {
  const clauses = text
    .split(CLAUSE_SPLIT)
    .map((clause) => clause.replace(/\s+/g, ' ').trim())
    .filter((clause) => clause !== '');
  if (clauses.length > GENERATOR_LIMITS.clauses) {
    throw new CliError(
      'validation',
      `--brief has ${clauses.length} clauses; the limit is ${GENERATOR_LIMITS.clauses}.`
    );
  }
  const reading = clauses.map((clause): BriefReading => {
    // Texuli 0.17.1 reads colors, their roles and fonts inside prose, but a
    // color between words can still be misread without an `unmapped` loss
    // (`rounded #0f766e Inter font` becomes the family "rounded … Inter",
    // `font Inter in #0f766e rounded` drops `rounded`). A clause with a color
    // is always read here; Texuli reads the one-liner this makes.
    if (!HEX_ONE.test(clause)) {
      const direct = importBrand(clause, { trust: 'untrusted', id: 'brief-clause' });
      if (direct.ok && !direct.warnings.some((warning) => warning.code === 'unmapped')) {
        return { clause, read: [clause] };
      }
    }
    return { clause, read: readProseClause(clause) };
  });
  const oneLiner = reading
    .flatMap((entry) => (entry.read.length > 0 ? entry.read : [entry.clause]))
    .join(', ');
  return { oneLiner, reading };
}

/** One color an SVG logo names, with how often it appears. */
export interface SvgLogoColor {
  color: string;
  count: number;
}

const SVG_ATTRIBUTE =
  /\b(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*(["'])([^"'<>]{0,64})\1/gi;
const SVG_STYLE =
  /\b(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*([^;"'{}<>]{1,64})/gi;
const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff' };
const IGNORED = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset']);

function channel(value: string, max: number): number | undefined {
  const text = value.trim();
  const percent = text.endsWith('%');
  const number = Number(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(number)) return undefined;
  const scaled = percent ? (number / 100) * max : number;
  return Math.max(0, Math.min(max, scaled));
}

/** A color value as `[r, g, b, a]` (0–255), or `undefined` when it is not a plain color. */
function svgColor(raw: string): [number, number, number, number] | undefined {
  const value = raw.trim().toLowerCase();
  const named = NAMED[value];
  if (named) return svgColor(named);
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1];
  if (hex) {
    const full =
      hex.length <= 4
        ? hex
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : hex;
    const parts = full.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 255];
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(value)?.[1];
  if (rgb) {
    const parts = rgb.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return undefined;
    const [r, g, b] = parts.slice(0, 3).map((part) => channel(part, 255));
    const a = parts[3] === undefined ? 255 : channel(parts[3], parts[3].endsWith('%') ? 255 : 1);
    if (r === undefined || g === undefined || b === undefined || a === undefined) return undefined;
    return [
      Math.round(r),
      Math.round(g),
      Math.round(b),
      Math.round(parts[3] === undefined || parts[3].endsWith('%') ? a : a * 255),
    ];
  }
  return undefined;
}

const toHex = (rgba: [number, number, number, number]) =>
  `#${rgba
    .slice(0, rgba[3] === 255 ? 3 : 4)
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('')}`;

/**
 * The colors an SVG logo names in `fill`, `stroke`, `stop-color` and the
 * like (attributes and inline CSS), read as text: the SVG is never parsed as
 * markup, rendered or executed. Hex, `rgb()`/`rgba()`, `black` and `white`
 * are read; `none`, `currentColor`, gradient references (`url(#…)`) and
 * other named colors are counted as ignored. Each color is weighted by how
 * often it appears, not by the area it covers.
 */
export function svgLogoColors(svg: string): { colors: SvgLogoColor[]; ignored: number } {
  const counts = new Map<string, number>();
  let ignored = 0;
  let seen = 0;
  const visit = (raw: string) => {
    if (seen >= GENERATOR_LIMITS.svgColors) return;
    seen += 1;
    const value = raw.trim().toLowerCase();
    const rgba = IGNORED.has(value) ? undefined : svgColor(value);
    if (!rgba || rgba[3] === 0) {
      ignored += 1;
      return;
    }
    const key = toHex(rgba);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const match of svg.matchAll(SVG_ATTRIBUTE)) visit(match[2] ?? '');
  for (const match of svg.matchAll(SVG_STYLE)) visit(match[1] ?? '');
  return { colors: [...counts].map(([color, count]) => ({ color, count })), ignored };
}

/** At most this many pixels per color, so one repeated color cannot flood the sample. */
const PIXELS_PER_OCCURRENCE = 16;
const MAX_PIXELS_PER_COLOR = 1024;

/** The colors as RGBA pixels for Texuli's `importLogoPixels` (weight = occurrences). */
export function logoPixels(colors: readonly SvgLogoColor[]): { data: number[] } {
  const data: number[] = [];
  for (const { color, count } of colors) {
    const rgba = svgColor(color);
    if (!rgba) continue;
    const pixels = Math.min(MAX_PIXELS_PER_COLOR, count * PIXELS_PER_OCCURRENCE);
    for (let index = 0; index < pixels; index++) data.push(...rgba);
  }
  return { data };
}

const RASTER: { name: string; test: (bytes: Buffer) => boolean }[] = [
  { name: 'PNG', test: (bytes) => bytes.subarray(0, 4).toString('latin1') === '\x89PNG' },
  { name: 'JPEG', test: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { name: 'GIF', test: (bytes) => bytes.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    name: 'WebP',
    test: (bytes) =>
      bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
      bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** What a generated design system was made from, for the report. */
export interface GeneratorSourceInfo {
  source: GeneratorSource;
  /** The workspace file, when the input was one. */
  file?: string;
  /** `--brief`: where the text came from and how each clause was read. */
  brief?: { from: 'text' | 'file' | 'stdin'; oneLiner: string; reading: BriefReading[] };
  /** `--from-logo`: the colors read from the SVG. */
  logo?: { format: 'svg'; colors: SvgLogoColor[]; ignored: number };
}

/** The flags `ds new` passes with a generator source. */
export interface GeneratorOptions {
  root: string;
  id: string;
  name?: string;
  source: GeneratorSource;
  value: string;
  /** `--brief` only: the other brand flags as clauses after the brief (`designSystemBrief`). */
  composeBrief?: (brief: string) => string;
}

/** The generated draft document and Texuli's report. */
export interface GeneratedDesignSystem {
  document: DesignSystem;
  report: DesignSystemGenerationReport;
  info: GeneratorSourceInfo;
}

/** `harbor-labs` → `Harbor Labs`: the display name when `--name` is not given. */
export function nameFromId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Reads the source, runs Texuli's generator at `trust: 'untrusted'` and
 * returns a draft document (any `approval` an input carried is dropped). A
 * generator refusal is a `validation` error whose data holds the errors and
 * the loss and repair report.
 */
export async function generateFromSource(
  options: GeneratorOptions
): Promise<GeneratedDesignSystem> {
  const { root, source, value } = options;
  const flag = SOURCE_FLAGS[source];
  const input: GenerateDesignSystemInput = {};
  const info: GeneratorSourceInfo = { source };
  if (source === 'tokens') {
    const text = utf8(readWorkspaceInput(root, value, GENERATOR_LIMITS.tokens, flag), flag, value);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new CliError('validation', `${flag}: ${value} is ${jsonErrorText(error)}.`, {
        hint: 'Pass a W3C DTCG or Tokens Studio JSON file.',
      });
    }
    input.tokens = parsed;
    info.file = value;
  } else if (source === 'css') {
    input.css = utf8(readWorkspaceInput(root, value, GENERATOR_LIMITS.css, flag), flag, value);
    info.file = value;
  } else if (source === 'logo') {
    const bytes = readWorkspaceInput(root, value, GENERATOR_LIMITS.logo, flag);
    const raster = RASTER.find((format) => format.test(bytes));
    if (raster || !/\.svg$/i.test(value)) {
      throw new CliError(
        'usage',
        `${flag} reads SVG logos only${raster ? `; ${value} is a ${raster.name} image` : ''}.`,
        {
          hint: "Protoyard does not decode raster images in the CLI. Pass an SVG, or the logo's main color with --brand <hex>.",
        }
      );
    }
    const text = utf8(bytes, flag, value);
    if (!/<svg[\s>]/i.test(text)) {
      throw new CliError('validation', `${flag}: ${value} has no <svg> element.`);
    }
    const { colors, ignored } = svgLogoColors(text);
    if (colors.length === 0) {
      throw new CliError('validation', `${flag}: no fill or stroke colors found in ${value}.`, {
        hint: 'Name the colors in fill/stroke attributes (hex or rgb()), or pass --brand <hex>.',
      });
    }
    input.logoPixels = logoPixels(colors);
    info.file = value;
    info.logo = { format: 'svg', colors, ignored };
  } else {
    const brief = await readBrief(root, value);
    if (brief.text.trim() === '') throw new CliError('usage', '--brief is empty.');
    const { importBrand } = await import('@texuli/tokens/design-system/import');
    const { oneLiner, reading } = readProseBrief(brief.text, importBrand);
    const composed = options.composeBrief ? options.composeBrief(oneLiner) : oneLiner;
    input.brief = composed;
    if (brief.file) info.file = brief.file;
    info.brief = { from: brief.from, oneLiner: composed, reading };
  }

  const { generateDesignSystem } = await import('@texuli/tokens/design-system/generate');
  const result = generateDesignSystem(input, {
    trust: 'untrusted',
    id: options.id,
    name: options.name ?? nameFromId(options.id),
  });
  if (!result.ok) {
    throw new CliError(
      'validation',
      `Texuli's generator could not make a design system from ${flag}.`,
      {
        data: { errors: result.errors, report: result.report, input: info },
        hint: result.errors
          .slice(0, 3)
          .map((error) => `${error.path}: ${error.message}`)
          .join(' · '),
      }
    );
  }
  const document = { ...(result.document as unknown as Record<string, unknown>) };
  // Always a draft: only `protoyard ds approve` approves.
  delete document.approval;
  return { document: document as unknown as DesignSystem, report: result.report, info };
}
