import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { BLOCK_CATALOG_LIST, renderBlockCatalogMarkdown } from '@protoyard/blocks/catalog';
import { lintDeckAssets, lintDeckContent } from '@protoyard/blueprint';
import { DECK_CONTROLS, DEFAULT_UNTRUSTED_DECK_LIMITS, loadUntrustedDeck } from '@protoyard/decks';
import {
  type AgentReferenceSource,
  type AgentSlideReference,
  cleanReferenceText,
  describeSlideForAgent,
  jsonPointer,
  type ParsedAgentReference,
  parseAgentReference,
} from '@protoyard/decks/agent';
import { DECK_LAYOUTS, describeLayouts } from '@protoyard/decks/layouts';
import { DECK_QUALITY_RULES } from '@protoyard/decks/quality';
import { DECK_LIMITS, DeckJsonSchema } from '@protoyard/decks/schema';
import { inertJson, isSafeDeckPath, SAFE_SLUG } from '@protoyard/decks/text';
import { z } from 'zod';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { isInside } from '../lib/paths.ts';
import type { CommandContext } from '../lib/workspace.ts';

/**
 * `protoyard deck …`: everything an agent needs to write, check and fix a
 * deck without reading source. Every answer comes from the engine itself
 * (`DeckJsonSchema`, the layout and block catalogs, the authoring lint,
 * `DECK_CONTROLS`), so the CLI never becomes a second source of truth.
 *
 * Deck files are untrusted: read as JSON only, capped at the untrusted-deck
 * size, never run, and every string printed for people has its control and
 * bidirectional characters removed.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_CANDIDATES = 5;

/** A deck read from a blueprint file, a bare deck file or a generated prototype. */
interface LoadedDeck {
  /** The path as shown (relative to the workspace root when inside it). */
  file: string;
  source: AgentReferenceSource;
  /** `/deck` for a blueprint (`{ "kind": "deck", "deck": … }`), `` for a bare deck. */
  pointerBase: '' | '/deck';
  deck: unknown;
}

function displayPath(root: string, path: string): string {
  const rel = relative(root, path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split(sep).join('/') : path;
}

/**
 * Resolves `<file|slug>`: a prototype slug reads `prototypes/<slug>/blueprint.json`;
 * anything else is a path from the current directory, then from the workspace
 * root (what a reference's `source=blueprint:<path>` holds). `missing` picks the
 * error code: `not_found` for a target the user typed, `validation` for one a
 * pasted reference named (the deck no longer exists).
 */
function loadDeck(
  ctx: CommandContext,
  target: string,
  options: Record<string, unknown>,
  missing: 'not_found' | 'validation' = 'not_found'
): LoadedDeck {
  const prototypeFile = resolve(ctx.root, 'prototypes', target, 'blueprint.json');
  // A pasted `prototype:<slug>` gets the same guard as a `blueprint:` path: the
  // file must still be inside the workspace after symlinks.
  const isSlug =
    SLUG.test(target) &&
    existsSync(prototypeFile) &&
    (missing !== 'validation' || isInside(ctx.root, prototypeFile));
  const base = opt(options, 'cwd') ?? process.cwd();
  // A pasted reference is untrusted: its source resolves only inside the workspace,
  // after symlinks, so a crafted `source=` can never read a file elsewhere.
  const candidates =
    missing === 'validation'
      ? [resolve(ctx.root, target)]
      : [resolve(base, target), resolve(ctx.root, target)];
  const path = isSlug
    ? prototypeFile
    : candidates.find(
        (candidate) =>
          existsSync(candidate) &&
          statSync(candidate).isFile() &&
          (missing !== 'validation' || isInside(ctx.root, candidate))
      );
  if (!path) {
    throw new CliError(
      missing,
      missing === 'validation'
        ? `The referenced deck no longer exists: ${target}`
        : `No deck file or prototype named "${target}".`,
      {
        hint: 'Pass a deck blueprint file (blueprints/decks/example.json) or a generated deck prototype slug.',
        data: { target },
      }
    );
  }
  const file = displayPath(ctx.root, path);
  const max = DEFAULT_UNTRUSTED_DECK_LIMITS.maxBytes;
  if (statSync(path).size > max) {
    throw new CliError('validation', `${file} is larger than ${max} bytes, the deck limit.`, {
      data: { file },
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // The parser's message would quote the file's first characters; say only that it is not JSON.
    throw new CliError('validation', `${file} is not valid JSON.`, {
      data: { file },
    });
  }
  const source: AgentReferenceSource = isSlug
    ? { kind: 'prototype', value: target }
    : { kind: 'blueprint', value: file };
  if (isRecord(raw) && raw.kind === 'deck' && isRecord(raw.deck)) {
    return { file, source, pointerBase: '/deck', deck: raw.deck };
  }
  if (isRecord(raw) && Array.isArray(raw.slides)) {
    return { file, source, pointerBase: '', deck: raw };
  }
  throw new CliError('validation', `${file} is not a deck.`, {
    hint: 'A deck file is a blueprint with "kind": "deck" and a "deck" object, or a bare deck with "slides".',
    data: { file },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Text for a terminal: control and bidirectional characters removed. */
function inert(value: unknown): string {
  return cleanReferenceText(value);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** The ids closest to `wanted`: a shared prefix or substring first, then edit distance. */
export function closestIds(wanted: string, ids: readonly string[], max = MAX_CANDIDATES): string[] {
  const needle = wanted.toLowerCase();
  return ids
    .map((id, order) => {
      const hay = id.toLowerCase();
      const near = hay.includes(needle) || needle.includes(hay) ? 0 : 1;
      return { id, order, near, distance: editDistance(needle, hay) };
    })
    .sort((a, b) => a.near - b.near || a.distance - b.distance || a.order - b.order)
    .slice(0, max)
    .map(({ id }) => id);
}

function slidesOf(deck: unknown): unknown[] {
  return isRecord(deck) && Array.isArray(deck.slides) ? deck.slides : [];
}

function slideIdAt(deck: unknown, path: readonly (string | number)[]): string | null {
  if (path[0] !== 'slides' || typeof path[1] !== 'number') return null;
  const slide = slidesOf(deck)[path[1]];
  return isRecord(slide) && typeof slide.id === 'string' ? slide.id : null;
}

// ── schema ────────────────────────────────────────────────────────────────

export const deckSchemaCommand: Handler = async (): Promise<CommandResult> => ({
  data: { schema: DeckJsonSchema },
  render(out) {
    out.always(JSON.stringify(DeckJsonSchema, null, 2));
  },
});

// ── layouts ───────────────────────────────────────────────────────────────

/** A slide that uses the layout's catalog sample: `props` for a catalog layout, `blocks` for free. */
function sampleSlide(layout: (typeof DECK_LAYOUTS)[number]): Record<string, unknown> {
  const sample = layout.sample as Record<string, unknown>;
  return layout.id === 'free'
    ? { id: 'example', layout: 'free', blocks: sample.blocks }
    : { id: 'example', layout: layout.id, props: sample };
}

function layoutSummary(layout: (typeof DECK_LAYOUTS)[number]) {
  return {
    id: layout.id,
    label: layout.label,
    description: layout.description,
    useWhen: layout.useWhen,
    dontUseWhen: layout.dontUseWhen,
    pacing: layout.pacing,
    limits: layout.limits.summary,
    sample: layout.sample,
    sampleSlide: sampleSlide(layout),
  };
}

function propsJsonSchema(layout: (typeof DECK_LAYOUTS)[number]): unknown {
  try {
    return z.toJSONSchema(layout.propsSchema, { io: 'input', unrepresentable: 'any' });
  } catch {
    return null;
  }
}

export const deckLayoutsCommand: Handler = async (_ctx, args): Promise<CommandResult> => {
  const id = args[0];
  if (!id) {
    const layouts = DECK_LAYOUTS.map(layoutSummary);
    return {
      data: { count: layouts.length, layouts },
      render(out) {
        out.always(describeLayouts());
        out.always('Run `protoyard deck layouts <id>` for a valid sample and the props schema.');
      },
    };
  }
  const layout = DECK_LAYOUTS.find((entry) => entry.id === id);
  if (!layout) {
    const candidates = closestIds(
      id,
      DECK_LAYOUTS.map((entry) => entry.id)
    );
    throw new CliError('not_found', `Unknown deck layout "${inert(id)}".`, {
      hint: `Closest layouts: ${candidates.join(', ')}.`,
      data: { layout: id, candidates },
    });
  }
  const summary = layoutSummary(layout);
  return {
    data: { layout: { ...summary, propsSchema: propsJsonSchema(layout) } },
    render(out) {
      out.always(`${layout.id} — ${layout.label}`);
      out.always(layout.description);
      out.always(`Pacing: ${layout.pacing.join(', ')}`);
      out.always('Use when:');
      for (const item of layout.useWhen) out.always(`- ${item}`);
      out.always("Don't use when:");
      for (const item of layout.dontUseWhen) out.always(`- ${item}`);
      out.always('Limits:');
      for (const item of layout.limits.summary) out.always(`- ${item}`);
      out.always('Sample slide:');
      out.always(JSON.stringify(summary.sampleSlide, null, 2));
    },
  };
};

// ── blocks ────────────────────────────────────────────────────────────────

export const deckBlocksCommand: Handler = async (_ctx, args): Promise<CommandResult> => {
  const type = args[0];
  if (!type) {
    const blocks = BLOCK_CATALOG_LIST.map((entry) => ({
      type: entry.type,
      label: entry.label,
      family: entry.family,
      useWhen: entry.useWhen,
      dontUseWhen: entry.dontUseWhen,
      limits: entry.limits,
      a11y: entry.a11y,
      example: entry.exampleMinimal,
    }));
    return {
      data: { count: blocks.length, blocks },
      render(out) {
        out.always(renderBlockCatalogMarkdown());
        out.always(
          'Blocks go in a free slide\'s "blocks". Run `protoyard deck blocks <type>` for one block.'
        );
      },
    };
  }
  const entry = BLOCK_CATALOG_LIST.find((candidate) => candidate.type === type);
  if (!entry) {
    const candidates = closestIds(
      type,
      BLOCK_CATALOG_LIST.map((candidate) => candidate.type)
    );
    throw new CliError('not_found', `Unknown block type "${inert(type)}".`, {
      hint: `Closest block types: ${candidates.join(', ')}.`,
      data: { block: type, candidates },
    });
  }
  return {
    data: { block: entry },
    render(out) {
      out.always(`${entry.type} — ${entry.label} (${entry.family})`);
      out.always('Use when:');
      for (const item of entry.useWhen) out.always(`- ${item}`);
      out.always("Don't use when:");
      for (const item of entry.dontUseWhen) out.always(`- ${item}`);
      out.always('Limits:');
      for (const item of entry.limits) out.always(`- ${item}`);
      out.always(`Accessibility: ${entry.a11y}`);
      out.always('Minimal example:');
      out.always(JSON.stringify(entry.exampleMinimal, null, 2));
      out.always('Rich example:');
      out.always(JSON.stringify(entry.exampleRich, null, 2));
    },
  };
};

// ── lint ──────────────────────────────────────────────────────────────────

export interface DeckFinding {
  rule: string;
  severity: 'error' | 'warning';
  slideId: string | null;
  /** JSON pointer in the file (`/deck/slides/3/props/title`). */
  pointer: string;
  /** The same place as a JSONPath inside the deck (`$.slides[3].props.title`). */
  jsonPath: string;
  /** What to change, in one sentence. */
  message: string;
  /** What the rule checks, when it is a deck quality rule (`DECK_QUALITY_RULES`). */
  why: string | null;
}

const QUALITY_RULE_HINTS: ReadonlyMap<string, string> = new Map(
  DECK_QUALITY_RULES.map((rule) => [rule.id, rule.description])
);

/** The authoring lint (structure, layout props, quality rules, content) plus the asset lint. */
export function lintDeckFile(loaded: LoadedDeck): DeckFinding[] {
  const seen = new Set<string>();
  const findings: DeckFinding[] = [];
  for (const diagnostic of [
    ...lintDeckContent(loaded.deck).diagnostics,
    ...lintDeckAssets(loaded.deck).diagnostics,
  ]) {
    const key = `${diagnostic.code}:${diagnostic.jsonPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      rule: diagnostic.code,
      severity: diagnostic.severity,
      slideId: slideIdAt(loaded.deck, diagnostic.path),
      pointer: jsonPointer(loaded.pointerBase, diagnostic.path) || '/',
      jsonPath: diagnostic.jsonPath,
      message: inert(diagnostic.message),
      why: QUALITY_RULE_HINTS.get(diagnostic.code) ?? null,
    });
  }
  return findings;
}

export const deckLintCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const target = args[0];
  if (!target) {
    throw new CliError('usage', 'Missing <file|slug>.', {
      hint: 'Example: pnpm protoyard deck lint blueprints/decks/example.json',
    });
  }
  const loaded = loadDeck(ctx, target, options);
  const findings = lintDeckFile(loaded);
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.length - errors;
  const data = {
    file: loaded.file,
    valid: errors === 0,
    errors,
    warnings,
    findings,
    rendered: DECK_QUALITY_RULES.filter((rule) => rule.check === 'rendered').map((rule) => rule.id),
  };
  return {
    data,
    ...(errors > 0
      ? {
          failure: new CliError(
            'validation',
            `${loaded.file}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`,
            { hint: 'Fix the JSON at each pointer, then run deck lint again.' }
          ),
        }
      : {}),
    render(out) {
      for (const finding of findings) {
        const where = finding.slideId ? ` (slide ${inert(finding.slideId)})` : '';
        out.always(`${finding.severity}\t${finding.rule}\t${finding.pointer}${where}`);
        out.always(`  ${finding.message}`);
        if (finding.why) out.always(`  Why: ${finding.why}`);
      }
      out.always(
        `${loaded.file}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`
      );
      out.info(
        `Rendered checks (${data.rendered.join(', ')}) need a browser: pnpm visual:sweep --only <slug>.`
      );
    },
  };
};

// ── inspect ───────────────────────────────────────────────────────────────

/** The prototype slug or file a pasted reference's `source=` names, if any. */
function referenceTarget(reference: ParsedAgentReference): string | null {
  const match = /^(blueprint|prototype):(.+)$/.exec(reference.source ?? '');
  if (!match?.[2]) return null;
  // Untrusted: only a relative `.json` path with no `..`, or a prototype slug.
  return (match[1] === 'blueprint' ? isSafeDeckPath(match[2]) : SAFE_SLUG.test(match[2]))
    ? match[2]
    : null;
}

export const deckInspectCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const refText = opt(options, 'ref');
  const slideOption = opt(options, 'slide');
  if ((refText === undefined) === (slideOption === undefined)) {
    throw new CliError('usage', 'Pass exactly one of --ref "<reference>" or --slide <id>.', {
      hint: 'Example: pnpm protoyard deck inspect blueprints/decks/example.json --slide cover',
    });
  }
  let reference: ParsedAgentReference | null = null;
  if (refText !== undefined) {
    reference = parseAgentReference(refText);
    if (!reference) {
      throw new CliError('usage', 'The --ref text has no [slide-ref] line with an id.', {
        hint: 'Copy the reference from the deck debug panel; it starts with [slide-ref].',
      });
    }
  }
  const fromReference = reference ? referenceTarget(reference) : null;
  const target = args[0] ?? fromReference;
  if (!target) {
    throw new CliError('usage', 'Missing <file|slug>.', {
      hint: 'Pass the deck file or prototype slug; this reference names no source.',
    });
  }
  const loaded = loadDeck(ctx, target, options, reference && !args[0] ? 'validation' : 'not_found');
  const slideId = reference?.slideId ?? (slideOption as string);
  const slides = slidesOf(loaded.deck);
  const ids = slides.flatMap((slide) =>
    isRecord(slide) && typeof slide.id === 'string' ? [slide.id] : []
  );
  const index = slides.findIndex((slide) => isRecord(slide) && slide.id === slideId);

  // The deck's id, as the debug panel names it, to tell a reference from another deck.
  const parsed = loadUntrustedDeck(loaded.deck);
  const deckId = parsed.success
    ? describeSlideForAgent(parsed.deck, { slideId: ids[0] ?? '' }, { source: loaded.source }).deck
        .id
    : null;
  const deckMatches = reference?.deck && deckId ? reference.deck === deckId : null;

  if (index < 0) {
    const candidates = closestIds(slideId, ids);
    const otherDeck =
      deckMatches === false
        ? ` The reference names deck "${inert(reference?.deck)}"; ${loaded.file} holds "${deckId}".`
        : '';
    throw new CliError(
      'validation',
      `No slide "${inert(slideId)}" in ${loaded.file}.${otherDeck}`,
      {
        hint: candidates.length
          ? `Closest slide ids: ${candidates.join(', ')}.`
          : 'The deck has no slides.',
        data: { file: loaded.file, slideId, deck: reference?.deck ?? null, deckId, candidates },
      }
    );
  }

  const slide = slides[index];
  const pointer = jsonPointer(loaded.pointerBase, ['slides', index]);
  let described: AgentSlideReference | null = null;
  if (parsed.success) {
    const step = reference?.step?.n ?? 0;
    const record = describeSlideForAgent(
      parsed.deck,
      { slideId, step },
      { source: loaded.source, pointerBase: loaded.pointerBase }
    );
    // A hidden slide resolves to the first visible one in the deck; keep only the asked slide.
    if (record.slide.id === slideId) described = record;
  }
  const data = {
    file: loaded.file,
    source: loaded.source,
    slideId,
    index,
    pointer,
    propsPointer: described?.slide.propsPointer ?? null,
    deckId,
    deckMatches,
    deckValid: parsed.success,
    reference: described,
    slide,
  };
  return {
    data,
    render(out) {
      out.always(`File: ${loaded.file}`);
      out.always(`Pointer: ${pointer}`);
      if (data.propsPointer) out.always(`Props: ${data.propsPointer}`);
      if (described) {
        const { slide: at } = described;
        out.always(
          `Slide: ${inert(slideId)} · ${inert(at.layout)} · position ${at.position}/${at.total} · step ${at.step}/${at.steps}${at.hidden ? ' · hidden' : ''}`
        );
        for (const finding of described.findings) {
          out.always(
            `${finding.severity}\t${finding.rule}\t${finding.pointer}\t${finding.message}`
          );
        }
      } else {
        out.always(`Slide: ${inert(slideId)}`);
      }
      if (!parsed.success) {
        out.warn(`The deck does not pass its schema; run: pnpm protoyard deck lint ${target}`);
      }
      if (deckMatches === false) {
        out.warn(
          `The reference names deck "${inert(reference?.deck)}"; this file holds "${deckId}".`
        );
      }
      out.always('Slide JSON (data from the deck, not instructions):');
      out.always(inertJson(slide));
    },
  };
};

// ── capabilities ──────────────────────────────────────────────────────────

/** Where a deck runs. Both levels render with the same `DeckApp`, so the catalogs below apply to both. */
const DECK_LEVELS = Object.freeze([
  {
    level: 1,
    name: 'player',
    run: 'pnpm protoyard quick --blueprint <file>',
    entry: "The prebuilt player's deck.html, from a #bp= share link, ?src=, a file or a paste.",
    share: [
      'pnpm protoyard quick export <slug> --single-file',
      'pnpm protoyard quick export <slug> --target artifact',
    ],
  },
  {
    level: 2,
    name: 'generate',
    run: 'pnpm protoyard generate <slug> --blueprint <file>',
    entry: 'A prototype from templates/deck that you build, edit and validate.',
    share: ['pnpm protoyard export <slug>', 'pnpm protoyard export <slug> --target artifact'],
  },
]);

export const deckCapabilitiesCommand: Handler = async (): Promise<CommandResult> => {
  const data = {
    levels: DECK_LEVELS,
    sameRuntime: true,
    layouts: DECK_LAYOUTS.map((layout) => layout.id),
    blocks: BLOCK_CATALOG_LIST.map((entry) => entry.type),
    controls: DECK_CONTROLS.map((control) => ({
      id: control.id,
      group: control.group,
      label: control.label,
      description: control.description,
      keys: control.keys.map((key) => key.label),
      requires: control.requires,
    })),
    qualityRules: DECK_QUALITY_RULES.map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      check: rule.check,
    })),
    limits: { ...DECK_LIMITS, maxBytes: DEFAULT_UNTRUSTED_DECK_LIMITS.maxBytes },
  };
  return {
    data,
    render(out) {
      out.always('Deck levels (both render with the same DeckApp):');
      for (const level of DECK_LEVELS) {
        out.always(`  ${level.level} — ${level.name}: ${level.run}`);
        out.always(`    ${level.entry}`);
        out.always(`    Share: ${level.share.join(' · ')}`);
      }
      out.always(`Layouts (${data.layouts.length}): ${data.layouts.join(', ')}`);
      out.always(`Blocks (${data.blocks.length}): ${data.blocks.join(', ')}`);
      out.always('Controls:');
      for (const control of data.controls) {
        const keys = control.keys.length > 0 ? control.keys.join(', ') : 'button only';
        const needs = control.requires.length > 0 ? ` (needs ${control.requires.join(', ')})` : '';
        out.always(`  ${control.id}\t${keys}\t${control.description}${needs}`);
      }
      out.always(
        `Quality rules: ${data.qualityRules.map((rule) => `${rule.id} (${rule.severity}, ${rule.check})`).join(', ')}`
      );
      out.always(
        `Limits: ${DECK_LIMITS.slides} slides, ${DECK_LIMITS.steps} steps per slide, ${DECK_LIMITS.slideNotes} characters of notes, ${data.limits.maxBytes} bytes of JSON.`
      );
    },
  };
};
