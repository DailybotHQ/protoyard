/**
 * Brief kind detection (ADR-036): decides whether a prose brief asks for an
 * app, a deck, a page or a doc before any app archetype is scored.
 *
 * The rules are deliberately conservative, because `app` is what every brief
 * meant before kinds existed:
 *
 * 1. An explicit kind always wins.
 * 2. A content kind is chosen only on a strong cue ("slides", "keynote",
 *    "landing page", "report", "one-pager"…). Weak cues ("talk", "hero",
 *    "article") are reported as a suggestion but never switch the kind.
 * 3. A cue followed by a tool noun ("slide deck builder", "report generator")
 *    describes an app that makes that content, so it counts for `app`.
 * 4. Strong cues for two content kinds, or an app noun ("app", "dashboard",
 *    "platform"…) before the first strong cue, make the brief ambiguous: the
 *    result is `app`, with a reason that names the conflict and how to pick.
 *
 * Matching is on whole lowercase words (`normalize`), longest phrase first,
 * so the same brief always gives the same result.
 */
import {
  BLUEPRINT_KINDS,
  type BlueprintKind,
  type ContentKind,
  DEFAULT_BLUEPRINT_KIND,
  isBlueprintKind,
  unknownKindMessage,
} from '../kinds/kind.ts';
import { normalize } from './text.ts';

export type CueStrength = 'strong' | 'weak';

/**
 * - `explicit`: the caller chose the kind.
 * - `high`: strong cues for one content kind and no app cue at all.
 * - `medium`: strong cues for one content kind, with app words only after them
 *   ("slides about our CRM app").
 * - `fallback`: no deciding cue, or an ambiguous brief; the kind is `app`.
 */
export type KindConfidence = 'explicit' | 'high' | 'medium' | 'fallback';

export interface KindCue {
  kind: BlueprintKind;
  /** The phrase as matched, in normalized words (`"one pager"`). */
  phrase: string;
  strength: CueStrength;
  /** Word offset in the normalized brief, for ordering and highlighting. */
  index: number;
}

export interface BriefKindDetection {
  kind: BlueprintKind;
  confidence: KindConfidence;
  /** True when cues pointed to more than one kind and `app` was kept. */
  ambiguous: boolean;
  /** One sentence a CLI or UI can show as is. */
  reason: string;
  /** Every cue found, in brief order. */
  cues: KindCue[];
  /** The content kind the cues lean to when they were not enough to switch. */
  suggestion: ContentKind | null;
}

export interface DetectKindOptions {
  /** An explicit kind (for example from `--kind`); overrides every cue. */
  kind?: BlueprintKind;
}

/** Briefs longer than this are read up to the limit (matches `MAX_BRIEF_LENGTH`). */
const MAX_DETECTION_LENGTH = 5_000;

interface CueList {
  strong: readonly string[];
  weak: readonly string[];
}

/** Content cues per kind, in normalized words ("one-pager" normalizes to "one pager"). */
export const KIND_CUES: Readonly<Record<ContentKind, CueList>> = {
  deck: {
    strong: [
      'slides',
      'slide deck',
      'slide decks',
      'slideshow',
      'slide show',
      'deck',
      'decks',
      'pitch deck',
      'keynote',
      'presentation',
      'presentations',
      'powerpoint',
    ],
    weak: [
      'slide',
      'talk',
      'pitch',
      'qbr',
      'webinar',
      'lecture',
      'all hands',
      'town hall',
      'demo day',
    ],
  },
  page: {
    strong: [
      'landing page',
      'landing pages',
      'one page site',
      'one page website',
      'single page site',
      'single page website',
      'marketing page',
      'marketing site',
      'marketing website',
      'homepage',
      'home page',
      'launch page',
      'waitlist page',
      'coming soon page',
      'pricing page',
      'product page',
      'sales page',
      'splash page',
      'microsite',
      'portfolio site',
      'portfolio website',
    ],
    weak: ['website', 'hero section', 'call to action', 'testimonials', 'waitlist', 'signup page'],
  },
  doc: {
    // Bare "report" and "document" are often verbs ("sensors report telemetry"),
    // so only a determiner or a qualifier makes them strong.
    strong: [
      'a report',
      'the report',
      'our report',
      'this report',
      'annual report',
      'quarterly report',
      'monthly report',
      'weekly report',
      'weekly reports',
      'monthly reports',
      'status report',
      'progress report',
      'research report',
      'incident report',
      'investor report',
      'board report',
      'impact report',
      'one pager',
      'one pagers',
      'whitepaper',
      'white paper',
      'memo',
      'memos',
      'handbook',
      'playbook',
      'proposal',
      'design doc',
      'design document',
      'a document',
      'the document',
      'write up',
      'writeup',
      'case study',
      'postmortem',
      'post mortem',
      'rfc',
    ],
    weak: [
      'report',
      'reports',
      'document',
      'article',
      'essay',
      'summary',
      'guide',
      'manual',
      'documentation',
      'faq',
      'readme',
    ],
  },
};

/** Nouns that name an app; before the first content cue, they keep the brief an app. */
export const APP_CUES: readonly string[] = [
  'app',
  'apps',
  'application',
  'applications',
  'web app',
  'mobile app',
  'dashboard',
  'dashboards',
  'portal',
  'platform',
  'saas',
  'software',
  'system',
  'tracker',
  'crm',
  'erp',
  'admin panel',
  'back office',
  'internal tool',
  'wiki',
  'knowledge base',
  'workspace',
];

/** A content cue followed by one of these names a tool that makes the content (an app). */
const TOOL_NOUNS: readonly string[] = [
  'dashboard',
  'dashboards',
  'portal',
  'app',
  'apps',
  'application',
  'builder',
  'builders',
  'editor',
  'editors',
  'maker',
  'makers',
  'generator',
  'generators',
  'creator',
  'creators',
  'tool',
  'tools',
  'software',
  'platform',
  'manager',
  'management',
  'tracker',
  'system',
];

/** Phrases where a cue word means something else; matches inside them are ignored. */
const FALSE_FRIENDS: readonly string[] = [
  'deck of cards',
  'card deck',
  'card decks',
  'boat deck',
  'sun deck',
  'deck chair',
  'pool deck',
  'presentation layer',
];

interface Span {
  start: number;
  end: number;
  phrase: string;
}

/** Every occurrence of every phrase as a word span, overlapping allowed. */
function findSpans(words: readonly string[], phrases: readonly string[]): Span[] {
  const spans: Span[] = [];
  for (const phrase of phrases) {
    const parts = phrase.split(' ');
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((part, j) => words[i + j] === part)) {
        spans.push({ start: i, end: i + parts.length, phrase });
      }
    }
  }
  return spans;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

interface Candidate extends Span {
  kind: BlueprintKind;
  strength: CueStrength;
}

function collectCues(words: readonly string[]): KindCue[] {
  const blocked = findSpans(words, FALSE_FRIENDS);
  const candidates: Candidate[] = [];
  for (const kind of BLUEPRINT_KINDS) {
    if (kind === 'app') {
      for (const span of findSpans(words, APP_CUES)) {
        candidates.push({ ...span, kind, strength: 'strong' });
      }
      continue;
    }
    for (const strength of ['strong', 'weak'] as const) {
      for (const span of findSpans(words, KIND_CUES[kind][strength])) {
        candidates.push({ ...span, kind, strength });
      }
    }
  }

  // Longest phrase first (then earliest, then strongest), so "pitch deck" beats
  // "pitch" and "deck", and each word belongs to at most one cue.
  candidates.sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start ||
      (a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1)
  );
  const accepted: Candidate[] = [];
  for (const candidate of candidates) {
    if (blocked.some((span) => overlaps(span, candidate))) continue;
    if (accepted.some((span) => overlaps(span, candidate))) continue;
    accepted.push(candidate);
  }

  return accepted
    .map((cue): KindCue => {
      // "report generator", "slide deck builder": an app that makes the content.
      const next = words[cue.end];
      const tool = cue.kind !== 'app' && next !== undefined && TOOL_NOUNS.includes(next);
      return tool
        ? { kind: 'app', phrase: `${cue.phrase} ${next}`, strength: 'strong', index: cue.start }
        : { kind: cue.kind, phrase: cue.phrase, strength: cue.strength, index: cue.start };
    })
    .sort((a, b) => a.index - b.index);
}

const quoted = (cues: readonly KindCue[]) =>
  [...new Set(cues.map((cue) => `"${cue.phrase}"`))].join(', ');

const CONTENT_ORDER: readonly ContentKind[] = ['deck', 'page', 'doc'];

/**
 * Detects the kind a brief asks for. Deterministic: the same brief and options
 * always give the same result. Throws a `RangeError` for an explicit kind this
 * version does not know.
 */
export function detectBriefKind(
  brief: string,
  options: DetectKindOptions = {}
): BriefKindDetection {
  const words = normalize(brief.slice(0, MAX_DETECTION_LENGTH)).split(' ').filter(Boolean);
  const cues = collectCues(words);

  if (options.kind !== undefined) {
    if (!isBlueprintKind(options.kind)) throw new RangeError(unknownKindMessage(options.kind));
    return {
      kind: options.kind,
      confidence: 'explicit',
      ambiguous: false,
      reason: `Kind "${options.kind}" was chosen explicitly.`,
      cues,
      suggestion: null,
    };
  }

  const strongBy = (kind: BlueprintKind) =>
    cues.filter((cue) => cue.kind === kind && cue.strength === 'strong');
  const contentStrong = CONTENT_ORDER.filter((kind) => strongBy(kind).length > 0);
  const appCues = strongBy('app');

  if (contentStrong.length === 0) {
    const weak = cues.filter((cue) => cue.kind !== 'app' && cue.strength === 'weak');
    if (weak.length === 0) {
      return {
        kind: DEFAULT_BLUEPRINT_KIND,
        confidence: 'fallback',
        ambiguous: false,
        reason:
          appCues.length > 0
            ? `App cues (${quoted(appCues)}) and no deck, page or doc cue: this is an app.`
            : 'No deck, page or doc cue: app is the default kind.',
        cues,
        suggestion: null,
      };
    }
    // Weak cues only lean one way; the earliest weak cue breaks a tie.
    const counts = CONTENT_ORDER.map((kind) => ({
      kind,
      count: weak.filter((cue) => cue.kind === kind).length,
      first: weak.find((cue) => cue.kind === kind)?.index ?? Number.POSITIVE_INFINITY,
    })).sort((a, b) => b.count - a.count || a.first - b.first);
    const lean = (counts[0] as { kind: ContentKind }).kind;
    return {
      kind: DEFAULT_BLUEPRINT_KIND,
      confidence: 'fallback',
      ambiguous: false,
      reason: `Only weak ${lean} cues (${quoted(weak.filter((cue) => cue.kind === lean))}): kept app. Pass kind "${lean}" to make a ${lean}.`,
      cues,
      suggestion: lean,
    };
  }

  if (contentStrong.length > 1) {
    const listed = contentStrong.map((kind) => `${kind} (${quoted(strongBy(kind))})`).join(' and ');
    const first = cues.find(
      (cue) => cue.strength === 'strong' && contentStrong.includes(cue.kind as ContentKind)
    );
    return {
      kind: DEFAULT_BLUEPRINT_KIND,
      confidence: 'fallback',
      ambiguous: true,
      reason: `Cues for ${listed} conflict: kept app. Pass the kind you want explicitly.`,
      cues,
      suggestion: (first?.kind as ContentKind | undefined) ?? null,
    };
  }

  const kind = contentStrong[0] as ContentKind;
  const kindCues = strongBy(kind);
  const firstContent = (kindCues[0] as KindCue).index;
  const appBefore = appCues.filter((cue) => cue.index < firstContent);
  if (appBefore.length > 0) {
    return {
      kind: DEFAULT_BLUEPRINT_KIND,
      confidence: 'fallback',
      ambiguous: true,
      reason: `App cues (${quoted(appBefore)}) come before the ${kind} cues (${quoted(kindCues)}): kept app. Pass kind "${kind}" to make a ${kind}.`,
      cues,
      suggestion: kind,
    };
  }
  return {
    kind,
    confidence: appCues.length > 0 ? 'medium' : 'high',
    ambiguous: false,
    reason:
      appCues.length > 0
        ? `${capitalize(kind)} cues (${quoted(kindCues)}) lead the brief; app words (${quoted(appCues)}) only describe the subject.`
        : `${capitalize(kind)} cues: ${quoted(kindCues)}.`,
    cues,
    suggestion: null,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
