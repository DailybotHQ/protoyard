import { createDeckNavigator } from '@texuli/deck/engine';
import { checkDeckStatic, type DeckQualityIssue } from '../quality/check.ts';
import type { Deck, DeckSlide } from '../schema/index.ts';
import { isSafeDeckPath, isSafeShareId, SAFE_SLUG } from '../text/safe.ts';

/**
 * "Debug for agents": a structured reference to the slide on screen, for a
 * coding agent. It is inspired by the developer's dev-only `[slide-ref]` bug
 * button on xergioalex.com, which copies one line naming the deck, the slide
 * id, its position and a text excerpt. This record adds what an agent needs
 * to change the slide without reading source:
 *
 * - the source file, prototype or share link;
 * - the JSON pointer of the slide and of each block;
 * - the layout, the step and the slide's lint findings.
 *
 * Pure and deterministic: no DOM, no clock and no randomness. Every string
 * from the deck is untrusted. `cleanReferenceText` removes control,
 * zero-width and bidirectional characters, every field is capped, and the
 * serialized record never exceeds `AGENT_REFERENCE_MAX_BYTES`.
 */

export const AGENT_REFERENCE_FORMAT = 'protoyard.slide-ref' as const;
export const AGENT_REFERENCE_VERSION = 1 as const;

/** The serialized record's UTF-8 size limit. */
export const AGENT_REFERENCE_MAX_BYTES = 8 * 1024;

/** Character caps per field (after cleaning). */
export const AGENT_REFERENCE_LIMITS = Object.freeze({
  id: 64,
  title: 160,
  source: 256,
  text: 280,
  layout: 64,
  blockType: 32,
  message: 200,
  url: 512,
  /** Blocks listed per slide (nested blocks included, in reading order). */
  blocks: 48,
  /** Lint findings listed per slide. */
  findings: 12,
});

/** Where the deck came from, when the host knows it. */
export interface AgentReferenceSource {
  kind: 'blueprint' | 'prototype' | 'share';
  /** A repository path (`blueprints/decks/x.json`), a prototype slug or a share id. */
  value: string;
}

export interface AgentReferenceBlock {
  pointer: string;
  type: string;
  id: string | null;
}

export interface AgentReferenceFinding {
  rule: string;
  severity: 'error' | 'warning';
  pointer: string;
  message: string;
}

export interface AgentSlideReference {
  format: typeof AGENT_REFERENCE_FORMAT;
  version: typeof AGENT_REFERENCE_VERSION;
  deck: {
    /** The deck's stable id (a slug, a blueprint name…), or null. */
    id: string | null;
    title: string | null;
    /** Slides a viewer can reach (hidden slides excluded). */
    visibleSlides: number;
  };
  source: AgentReferenceSource | null;
  slide: {
    id: string;
    title: string | null;
    layout: string;
    /** Index in `deck.slides` (what the JSON pointer uses). */
    index: number;
    /** 1-based position among visible slides, as the deck shows it; 0 for a hidden slide. */
    position: number;
    total: number;
    /** The step in the hash (`#/<id>/<step>`): 0 before any reveal. */
    step: number;
    /** Reveal steps on the slide; `step` runs from 0 to `steps`. */
    steps: number;
    hidden: boolean;
    /** JSON pointer of the slide in its source file (`/deck/slides/11`). */
    pointer: string;
    /** JSON pointer of a catalog slide's props, or null for a free slide. */
    propsPointer: string | null;
    hash: string;
    /** The page URL with the hash, when the host passed an http(s) URL. */
    url: string | null;
  };
  blocks: AgentReferenceBlock[];
  /** Visible text on the slide, cleaned and capped (notes excluded). */
  text: string;
  notes: { present: boolean; characters: number };
  findings: AgentReferenceFinding[];
  /** True when lists were shortened to keep the record under the size limit. */
  truncated: boolean;
}

export interface DescribeSlideOptions {
  source?: AgentReferenceSource | null;
  /** The deck's stable id; defaults to a slug of the outline title. */
  deckId?: string | null;
  /** The deck's title; defaults to the outline title. */
  title?: string | null;
  /** Where the deck object sits in its file: `/deck` in a blueprint (the default), `` for a bare deck. */
  pointerBase?: string;
  /** The page URL (http or https; the hash is replaced). */
  url?: string | null;
  /**
   * Lint findings for the deck, when the caller already has them. Default:
   * `checkDeckStatic(deck)` (the deck must have passed `safeParseDeck`).
   */
  findings?: readonly DeckQualityIssue[];
}

export interface DeckLocationInput {
  slideId: string;
  step?: number;
}

/**
 * The source only when its value is safe to print inside a suggested command
 * and to resolve in a workspace: a relative `.json` path with no `..`, a
 * prototype slug or a share id. Anything else (a crafted `?src=` carrying
 * shell syntax or a path escape) is dropped rather than echoed to an agent.
 */
export function safeAgentSource(
  source: AgentReferenceSource | null | undefined
): AgentReferenceSource | null {
  if (!source) return null;
  const value = cleanReferenceText(source.value);
  if (value.length > AGENT_REFERENCE_LIMITS.source) return null;
  const safe =
    source.kind === 'blueprint'
      ? isSafeDeckPath(value)
      : source.kind === 'prototype'
        ? SAFE_SLUG.test(value)
        : isSafeShareId(value);
  return safe ? { kind: source.kind, value } : null;
}

/** Removes control, zero-width and bidirectional characters, then squashes whitespace. */
export function cleanReferenceText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point.
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** `cleanReferenceText`, then at most `max` characters (an ellipsis marks a cut). */
export function capText(value: unknown, max: number): string {
  const clean = cleanReferenceText(value);
  const chars = [...clean];
  if (chars.length <= max) return clean;
  return `${chars
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}…`;
}

/** RFC 6901 escaping of one pointer segment. */
function segment(value: string | number): string {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function jsonPointer(base: string, path: readonly (string | number)[]): string {
  return `${base}${path.map((part) => `/${segment(part)}`).join('')}`;
}

/** A deck id from free text: lowercase, dashes, at most 64 characters. */
function slug(value: string): string {
  return cleanReferenceText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, AGENT_REFERENCE_LIMITS.id);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Every block of a free slide in reading order, with its path from the slide:
 * container children (`columns`, `tabs` panels, `reveal`) follow their parent.
 */
function walkBlocks(
  list: unknown,
  path: (string | number)[],
  out: { path: (string | number)[]; block: Record<string, unknown> }[],
  depth = 0
): void {
  if (!Array.isArray(list) || depth > 8) return;
  list.forEach((block, index) => {
    if (!isRecord(block)) return;
    const here = [...path, index];
    out.push({ path: here, block });
    if (Array.isArray(block.blocks)) walkBlocks(block.blocks, [...here, 'blocks'], out, depth + 1);
    if (block.type === 'columns' && Array.isArray(block.columns)) {
      block.columns.forEach((column, c) => {
        walkBlocks(column, [...here, 'columns', c], out, depth + 1);
      });
    }
    if (block.type === 'tabs' && Array.isArray(block.panels)) {
      block.panels.forEach((panel, p) => {
        if (isRecord(panel))
          walkBlocks(panel.blocks, [...here, 'panels', p, 'blocks'], out, depth + 1);
      });
    }
  });
}

/** Keys whose strings are never shown as slide text. */
const NON_TEXT_KEYS = new Set([
  'id',
  'type',
  'layout',
  'src',
  'poster',
  'href',
  'alt',
  'lang',
  'icon',
  'tone',
  'variant',
  'background',
  'transition',
  'fragment',
  'reveal',
  'kind',
  'fit',
  'position',
  'avatar',
  'notes',
  'highlights',
  'format',
  'orientation',
  'size',
  'align',
]);

/** Markdown to plain words: link targets, emphasis and heading marks go. */
function plain(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~#>|]+/g, ' ');
}

/** Visible strings of a slide value, in document order (depth-capped). */
function collectText(value: unknown, out: string[], depth = 0, key = ''): void {
  if (depth > 10 || out.length > 400) return;
  if (typeof value === 'string') {
    if (!NON_TEXT_KEYS.has(key)) out.push(plain(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1, key);
    return;
  }
  if (isRecord(value)) {
    for (const [childKey, child] of Object.entries(value)) {
      if (NON_TEXT_KEYS.has(childKey)) continue;
      collectText(child, out, depth + 1, childKey);
    }
  }
}

function slideText(slide: DeckSlide): string {
  const parts: string[] = [];
  if (slide.title) parts.push(slide.title);
  collectText('props' in slide ? slide.props : (slide as { blocks?: unknown }).blocks, parts);
  return capText(parts.join(' '), AGENT_REFERENCE_LIMITS.text);
}

function httpUrl(url: string | null | undefined, hash: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = hash;
    const value = parsed.href;
    return value.length <= AGENT_REFERENCE_LIMITS.url ? value : null;
  } catch {
    return null;
  }
}

/** UTF-8 bytes of the serialized record. */
export function referenceBytes(record: AgentSlideReference): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

/**
 * Describes the slide at `location` for a coding agent. The location resolves
 * the way `DeckApp` resolves it: an unknown or hidden id opens the first
 * visible slide, and the step is clamped to the slide's range.
 */
export function describeSlideForAgent(
  deck: Deck,
  location: DeckLocationInput,
  options: DescribeSlideOptions = {}
): AgentSlideReference {
  // The engine navigator: `stepCount` is the slide's last step (0 … stepCount are its positions).
  const nav = createDeckNavigator(deck);
  const resolved = nav.goTo(location.slideId, location.step ?? 0);
  const index = resolved.slideIndex;
  const slide = deck.slides[index] as DeckSlide;
  const visible = nav.visibleSlides();
  const visibleIndex = visible.findIndex((candidate: { id: string }) => candidate.id === slide.id);
  const base = options.pointerBase ?? '/deck';
  const slidePath = ['slides', index];
  const pointer = jsonPointer(base, slidePath);
  const hash = `#/${slide.id}/${resolved.step}`;
  const outlineTitle = deck.outline?.title ?? null;
  const title = options.title ?? outlineTitle;

  const walked: { path: (string | number)[]; block: Record<string, unknown> }[] = [];
  if (!('props' in slide)) walkBlocks((slide as { blocks?: unknown }).blocks, ['blocks'], walked);
  const blocks = walked.slice(0, AGENT_REFERENCE_LIMITS.blocks).map(({ path, block }) => ({
    pointer: jsonPointer(pointer, path),
    type: capText(block.type, AGENT_REFERENCE_LIMITS.blockType) || 'unknown',
    id: typeof block.id === 'string' ? capText(block.id, AGENT_REFERENCE_LIMITS.id) : null,
  }));

  const issues = options.findings ?? checkDeckStatic(deck).issues;
  const ownFindings = issues.filter((issue) => issue.slideId === slide.id);
  const findings = ownFindings.slice(0, AGENT_REFERENCE_LIMITS.findings).map((issue) => ({
    rule: capText(issue.rule, AGENT_REFERENCE_LIMITS.id),
    severity: issue.severity,
    pointer: jsonPointer(base, issue.path),
    message: capText(issue.message, AGENT_REFERENCE_LIMITS.message),
  }));

  const notes = cleanReferenceText(slide.notes);
  const record: AgentSlideReference = {
    format: AGENT_REFERENCE_FORMAT,
    version: AGENT_REFERENCE_VERSION,
    deck: {
      id:
        options.deckId != null
          ? capText(options.deckId, AGENT_REFERENCE_LIMITS.id) || null
          : outlineTitle
            ? slug(outlineTitle) || null
            : null,
      title: title ? capText(title, AGENT_REFERENCE_LIMITS.title) || null : null,
      visibleSlides: visible.length,
    },
    source: safeAgentSource(options.source),
    slide: {
      id: slide.id,
      title: slide.title ? capText(slide.title, AGENT_REFERENCE_LIMITS.title) || null : null,
      layout: capText(slide.layout, AGENT_REFERENCE_LIMITS.layout),
      index,
      position: visibleIndex >= 0 ? visibleIndex + 1 : 0,
      total: visible.length,
      step: resolved.step,
      steps: resolved.stepCount,
      hidden: slide.hidden === true,
      pointer,
      propsPointer: 'props' in slide ? jsonPointer(pointer, ['props']) : null,
      hash,
      url: httpUrl(options.url, hash),
    },
    blocks,
    text: slideText(slide),
    notes: { present: notes.length > 0, characters: [...notes].length },
    findings,
    truncated:
      walked.length > AGENT_REFERENCE_LIMITS.blocks ||
      ownFindings.length > AGENT_REFERENCE_LIMITS.findings,
  };

  // Keep the whole record under the size limit: drop blocks, then findings,
  // then shorten the text, marking the cut.
  while (referenceBytes(record) > AGENT_REFERENCE_MAX_BYTES && record.blocks.length > 0) {
    record.blocks.pop();
    record.truncated = true;
  }
  while (referenceBytes(record) > AGENT_REFERENCE_MAX_BYTES && record.findings.length > 0) {
    record.findings.pop();
    record.truncated = true;
  }
  if (referenceBytes(record) > AGENT_REFERENCE_MAX_BYTES) {
    record.text = capText(record.text, 80);
    record.truncated = true;
  }
  return record;
}
