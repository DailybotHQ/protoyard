/**
 * Kind-specific brief synthesizers for deck, page and doc (ADR-036).
 * Called by `blueprintFromBrief` after kind detection, before any app
 * archetype scoring. Output is honest draft scaffolding: stable ids, no
 * fabricated facts. Richer outline templates land in later authoring tasks.
 */
import { hashString } from '@protoyard/core';
import type { ContentKind } from '../kinds/kind.ts';
import type { BriefKindDetection } from './kind-detection.ts';
import { normalize, titleCase } from './text.ts';

/** Longer briefs are cut here (same cap as app synthesis). */
export const MAX_CONTENT_BRIEF_LENGTH = 5_000;

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
  const source = brief.slice(0, MAX_CONTENT_BRIEF_LENGTH);
  const name = pickName(source, 'deck', options.name);
  const title = firstSentence(source) || name;
  const rationale = [
    detection.reason,
    'Deck outline: generic (title, agenda, close). Richer pitch/QBR/lesson templates land in deck-outlines.',
    'Slide bodies are placeholders — no fabricated facts.',
  ];
  return {
    kind: 'deck',
    kindDetection: detection,
    outline: 'generic',
    rationale,
    json: {
      ...base('deck', name, title.slice(0, 280)),
      deck: {
        title: title.slice(0, 80),
        aspect: '16:9',
        slides: [
          {
            id: 'slide-title',
            role: 'title',
            title: title.slice(0, 80),
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
        ],
      },
    },
  };
}

/** Minimal page: hero, sections, footer. */
export function synthesizePageFromBrief(
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  const source = brief.slice(0, MAX_CONTENT_BRIEF_LENGTH);
  const name = pickName(source, 'page', options.name);
  const title = firstSentence(source) || name;
  const rationale = [
    detection.reason,
    'Page outline: generic (hero, sections, footer). Richer landing templates land in page-doc-outlines.',
    'Interactive forms and persistence are omitted here (PAGES lane owns them).',
  ];
  return {
    kind: 'page',
    kindDetection: detection,
    outline: 'generic',
    rationale,
    json: {
      ...base('page', name, title.slice(0, 280)),
      page: {
        title: title.slice(0, 80),
        sections: [
          {
            id: 'section-hero',
            role: 'hero',
            title: title.slice(0, 80),
            body: 'Hero placeholder.',
          },
          {
            id: 'section-body',
            role: 'body',
            title: 'Details',
            body: 'Add the main page sections here.',
          },
          {
            id: 'section-footer',
            role: 'footer',
            title: 'Footer',
            body: 'Contact or links placeholder.',
          },
        ],
      },
    },
  };
}

/** Minimal doc: title, summary, body sections. */
export function synthesizeDocFromBrief(
  brief: string,
  detection: BriefKindDetection,
  options: ContentBriefOptions = {}
): ContentBriefResult {
  const source = brief.slice(0, MAX_CONTENT_BRIEF_LENGTH);
  const name = pickName(source, 'doc', options.name);
  const title = firstSentence(source) || name;
  const rationale = [
    detection.reason,
    'Doc outline: generic (title, summary, body). Richer report/handbook templates land in page-doc-outlines.',
    'Section bodies are placeholders — no fabricated facts.',
  ];
  return {
    kind: 'doc',
    kindDetection: detection,
    outline: 'generic',
    rationale,
    json: {
      ...base('doc', name, title.slice(0, 280)),
      doc: {
        title: title.slice(0, 80),
        sections: [
          {
            id: 'section-title',
            role: 'title',
            title: title.slice(0, 80),
            body: 'Document title block.',
          },
          {
            id: 'section-summary',
            role: 'summary',
            title: 'Summary',
            body: 'One-paragraph summary placeholder.',
          },
          {
            id: 'section-body',
            role: 'body',
            title: 'Body',
            body: 'Add the main document sections here.',
          },
        ],
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
