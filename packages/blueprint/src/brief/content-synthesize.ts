/**
 * Kind-specific brief synthesizers for deck, page and doc (ADR-036).
 * Called by `blueprintFromBrief` after kind detection, before any app
 * archetype scoring. Output is honest draft scaffolding: stable ids, no
 * fabricated facts. Page and doc section outlines live in `page-doc-outlines.ts`.
 */
import { hashString } from '@protoyard/core';
import type { ContentKind } from '../kinds/kind.ts';
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

function firstSentence(source: string): string {
  const sentence =
    source
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? '';
  return sentence.slice(0, 280);
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

/** Minimal deck: title, agenda, close. Stable slide ids; placeholder copy only. */
export function synthesizeDeckFromBrief(
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  const bound = boundBriefInput(brief, { maxLength: MAX_CONTENT_BRIEF_LENGTH });
  const source = bound.brief;
  const name = pickName(source, 'deck', options.name);
  const title = (firstSentence(source) || name).slice(0, 80);
  const slides = [
    {
      id: 'slide-title',
      role: 'title',
      title,
      body: 'Add the opening claim here.',
    },
    {
      id: 'slide-agenda',
      role: 'agenda',
      title: 'Agenda',
      body: 'List the sections you will cover.',
    },
    {
      id: 'slide-close',
      role: 'close',
      title: 'Next steps',
      body: 'Close with a clear ask or summary.',
    },
  ];
  const clipped = applyOutlineBounds({ kind: 'deck', title, slides });
  const rationale = [
    detection.reason,
    ...bound.notices,
    ...clipped.notices,
    'Deck outline: generic (title, agenda, close). Richer pitch/QBR/lesson templates land in deck-outlines.',
    'Slide bodies are placeholders — no fabricated facts.',
  ];
  return {
    kind: 'deck',
    kindDetection: detection,
    outline: 'generic',
    rationale,
    json: {
      ...base('deck', name, (clipped.outline.title ?? title).slice(0, 280)),
      deck: {
        title: (clipped.outline.title ?? title).slice(0, 80),
        aspect: '16:9',
        slides: clipped.outline.slides ?? slides,
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
  const name = options.name?.trim()
    ? options.name.trim().slice(0, 80)
    : pickName(source, 'page', clipped.outline.title ?? built.title);
  const rationale = [detection.reason, ...bound.notices, ...clipped.notices, ...built.rationale];
  return {
    kind: 'page',
    kindDetection: detection,
    outline: built.outline,
    rationale,
    json: {
      ...base('page', name, (clipped.outline.title ?? built.title).slice(0, 280)),
      page: {
        title: (clipped.outline.title ?? built.title).slice(0, 80),
        outline: built.outline,
        sections: clipped.outline.sections ?? built.sections,
      },
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
  const name = options.name?.trim()
    ? options.name.trim().slice(0, 80)
    : pickName(source, 'doc', clipped.outline.title ?? built.title);
  const rationale = [detection.reason, ...bound.notices, ...clipped.notices, ...built.rationale];
  return {
    kind: 'doc',
    kindDetection: detection,
    outline: built.outline,
    rationale,
    json: {
      ...base('doc', name, (clipped.outline.title ?? built.title).slice(0, 280)),
      doc: {
        title: (clipped.outline.title ?? built.title).slice(0, 80),
        outline: built.outline,
        sections: clipped.outline.sections ?? built.sections,
      },
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
