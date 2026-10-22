/**
 * Kind-specific brief synthesizers for deck, page and doc (ADR-036).
 * Called by `blueprintFromBrief` after kind detection, before any app
 * archetype scoring. Output is honest draft scaffolding: stable ids, no
 * fabricated facts. Page and doc section outlines live in `page-doc-outlines.ts`.
 */
import { hashString } from '@protoyard/core';
import { propsForSelectedLayout, selectDeckLayouts } from '../authoring/select-deck-layouts.ts';
import type { ContentKind } from '../kinds/kind.ts';
import { synthesizeDeckOutline } from './deck-outlines.ts';
import { docBodyFromOutline, draftSlugId, pageBodyFromOutline } from './draft-bodies.ts';
import type { BriefKindDetection } from './kind-detection.ts';
import {
  applyOutlineBounds,
  boundBriefInput,
  MAX_CONTENT_BRIEF_LENGTH as CONTENT_CAP,
} from './limits.ts';
import { buildDocOutline, buildPageOutline } from './page-doc-outlines.ts';
import { normalize, titleCase } from './text.ts';

/** Longer briefs are cut here (same cap as app synthesis). */
export const MAX_CONTENT_BRIEF_LENGTH = CONTENT_CAP;

const NAME_WORDS = [
  'Harbor',
  'Lumen',
  'Cedar',
  'Beacon',
  'Juniper',
  'Copper',
  'Willow',
  'Lantern',
  'Meadow',
  'Summit',
  'Quarry',
  'Tidal',
  'Ember',
  'Orchard',
  'Kestrel',
  'Maple',
] as const;

export interface ContentBriefOptions {
  /** Product / document name; default: a fictional name from the brief. */
  name?: string;
}

export interface ContentBriefResult {
  kind: ContentKind;
  kindDetection: BriefKindDetection;
  /** Outline family id (generic until richer templates ship). */
  outline: string;
  /**
   * Draft content blueprint as plain JSON (formatVersion, name, kind, body).
   * Not validated against engine body schemas until those are wired.
   */
  json: Record<string, unknown>;
  rationale: string[];
}

function pickName(source: string, kind: ContentKind, forced?: string): string {
  if (forced?.trim()) return forced.trim().slice(0, 80);
  const normalized = normalize(source);
  const word = NAME_WORDS[hashString(normalized || kind) % NAME_WORDS.length] as string;
  const label = kind === 'deck' ? 'Deck' : kind === 'page' ? 'Page' : 'Doc';
  return `${word} ${label}`.slice(0, 80);
}

function brandSeed(name: string): string {
  const seeds = [
    '#0284c7',
    '#059669',
    '#0f766e',
    '#1d4ed8',
    '#4338ca',
    '#7c3aed',
    '#b45309',
    '#be123c',
  ] as const;
  return seeds[hashString(name) % seeds.length] as string;
}

function base(kind: ContentKind, name: string, description: string): Record<string, unknown> {
  return {
    formatVersion: 1,
    name,
    description: description || `${titleCase(kind)} draft.`,
    tags: [kind],
    brand: {
      name: name.slice(0, 40),
      seed: brandSeed(name),
      styleProfile: 'soft',
      font: 'humanist',
    },
    kind,
  };
}

/**
 * Deck brief → outline templates (pitch/QBR/…) + deterministic layout selection.
 * Free-slide blocks stay as draft scaffolding; catalog layouts get minimal props
 * from the slide title when selection leaves `free`.
 */
export function synthesizeDeckFromBrief(
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  const bound = boundBriefInput(brief, { maxLength: MAX_CONTENT_BRIEF_LENGTH });
  const source = bound.brief;
  const name = pickName(source, 'deck', options.name);
  const outline = synthesizeDeckOutline(source, {
    title: options.name?.trim() ? options.name.trim().slice(0, 80) : undefined,
  });

  const selections = selectDeckLayouts(
    outline.plan.map((slide, index) => {
      const body = outline.deck.slides[index];
      const blockTypes =
        body && Array.isArray(body.blocks)
          ? body.blocks
              .map((block) =>
                block && typeof block === 'object' && 'type' in block
                  ? String((block as { type: unknown }).type)
                  : ''
              )
              .filter(Boolean)
          : [];
      return {
        id: slide.id,
        role: slide.role,
        pacing: slide.pacing,
        purpose: slide.purpose,
        blockTypes,
      };
    }),
    { aspect: outline.deck.aspect }
  );

  const slides = outline.deck.slides.map((slide, index) => {
    const choice = selections[index];
    const layout = choice?.layout ?? 'free';
    if (layout === 'free') {
      return slide;
    }
    return {
      id: slide.id,
      title: slide.title,
      layout,
      props: propsForSelectedLayout(layout, { title: slide.title, purpose: slide.notes }),
      notes: slide.notes,
    };
  });

  const rationale = [
    detection.reason,
    ...bound.notices,
    ...outline.rationale,
    ...selections.map((row) => `${row.id}: ${row.rationale}`),
    'Slide bodies are draft placeholders — no fabricated facts.',
  ];

  return {
    kind: 'deck',
    kindDetection: detection,
    outline: outline.outline,
    rationale,
    json: {
      ...base('deck', name, outline.deck.title.slice(0, 280)),
      // DeckBodySchema is DeckSchema: style + slides only (no title/aspect keys).
      deck: {
        style: { aspect: outline.deck.aspect },
        slides,
      },
    },
  };
}

/** Page outlines (landing, pricing, waitlist, generic) with bounded blocks. */
export function synthesizePageFromBrief(
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  const bound = boundBriefInput(brief, { maxLength: MAX_CONTENT_BRIEF_LENGTH });
  const source = bound.brief;
  const built = buildPageOutline(source, { title: options.name });
  const clipped = applyOutlineBounds({
    kind: 'page',
    title: built.title,
    sections: built.sections,
  });
  const title = (clipped.outline.title ?? built.title).slice(0, 120);
  const name = options.name?.trim()
    ? options.name.trim().slice(0, 80)
    : pickName(source, 'page', title);
  const rationale = [detection.reason, ...bound.notices, ...clipped.notices, ...built.rationale];
  const sections = (clipped.outline.sections ?? built.sections) as typeof built.sections;
  const page = pageBodyFromOutline({
    id: draftSlugId(name, 'page-draft'),
    title,
    description: title,
    sections,
  });
  return {
    kind: 'page',
    kindDetection: detection,
    outline: built.outline,
    rationale,
    json: {
      ...base('page', name, title.slice(0, 280)),
      page,
    },
  };
}

/** Doc outlines (report, handbook, one-pager, proposal, generic) with bounded blocks. */
export function synthesizeDocFromBrief(
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  const bound = boundBriefInput(brief, { maxLength: MAX_CONTENT_BRIEF_LENGTH });
  const source = bound.brief;
  const built = buildDocOutline(source, { title: options.name });
  const clipped = applyOutlineBounds({
    kind: 'doc',
    title: built.title,
    sections: built.sections,
  });
  const title = (clipped.outline.title ?? built.title).slice(0, 120);
  const name = options.name?.trim()
    ? options.name.trim().slice(0, 80)
    : pickName(source, 'doc', title);
  const rationale = [detection.reason, ...bound.notices, ...clipped.notices, ...built.rationale];
  const sections = (clipped.outline.sections ?? built.sections) as typeof built.sections;
  const doc = docBodyFromOutline({
    id: draftSlugId(name, 'doc-draft'),
    title,
    description: title,
    sections,
  });
  return {
    kind: 'doc',
    kindDetection: detection,
    outline: built.outline,
    rationale,
    json: {
      ...base('doc', name, title.slice(0, 280)),
      doc,
    },
  };
}

export function synthesizeContentFromBrief(
  kind: ContentKind,
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  switch (kind) {
    case 'deck':
      return synthesizeDeckFromBrief(brief, detection, options);
    case 'page':
      return synthesizePageFromBrief(brief, detection, options);
    case 'doc':
      return synthesizeDocFromBrief(brief, detection, options);
  }
}
