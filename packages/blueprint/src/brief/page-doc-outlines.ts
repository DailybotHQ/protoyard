/**
 * Section-based outlines for page and doc briefs (ADR-036).
 *
 * Pure and deterministic: stable section ids, ordered sections, bounded block
 * vocabulary (heading, text, list, cta, stat, quote, callout, divider). No app
 * entities or roles. Unsupported interactive features are listed as explicit
 * omissions in the rationale — never invented as live behavior.
 */
import { hashString } from '@protoyard/core';
import { hasPhrase, normalize, titleCase } from './text.ts';

export const PAGE_OUTLINE_IDS = ['landing', 'pricing', 'waitlist', 'generic'] as const;
export type PageOutlineId = (typeof PAGE_OUTLINE_IDS)[number];

export const DOC_OUTLINE_IDS = ['report', 'handbook', 'one-pager', 'proposal', 'generic'] as const;
export type DocOutlineId = (typeof DOC_OUTLINE_IDS)[number];

/** Draft block shapes for outlines — placeholders only, not full BlockSchema. */
export type OutlineBlock =
  | { type: 'heading'; text: string; level?: 1 | 2 | 3 | 4 }
  | { type: 'text'; markdown: string }
  | { type: 'list'; style?: 'bullet' | 'number' | 'check'; items: string[] }
  | { type: 'cta'; label: string; href?: string }
  | { type: 'stat'; items: { value: string; label: string }[] }
  | { type: 'quote'; quote: string; cite?: string }
  | { type: 'callout'; body: string; title?: string }
  | { type: 'divider'; label?: string };

export interface OutlineSection {
  id: string;
  role: string;
  title: string;
  /** First plain-text teaser (editors that only read `body`). */
  body: string;
  blocks: OutlineBlock[];
}

export interface PageOutlineResult {
  outline: PageOutlineId;
  title: string;
  sections: OutlineSection[];
  rationale: string[];
  /** Interactive or product features the brief asked for that this outline skips. */
  omissions: string[];
}

export interface DocOutlineResult {
  outline: DocOutlineId;
  title: string;
  sections: OutlineSection[];
  rationale: string[];
  omissions: string[];
}

export interface OutlineBuildOptions {
  /** Forced product / document title. */
  title?: string;
}

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

function firstSentence(source: string): string {
  const sentence =
    source
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? '';
  return sentence.slice(0, 280);
}

function pickTitle(source: string, kind: 'page' | 'doc', forced?: string): string {
  if (forced?.trim()) return forced.trim().slice(0, 80);
  const fromBrief = firstSentence(source);
  if (fromBrief.length >= 8) return fromBrief.slice(0, 80);
  const word = NAME_WORDS[hashString(normalize(source) || kind) % NAME_WORDS.length] as string;
  return `${word} ${kind === 'page' ? 'Page' : 'Doc'}`.slice(0, 80);
}

function section(id: string, role: string, title: string, blocks: OutlineBlock[]): OutlineSection {
  return {
    id,
    role,
    title: title.slice(0, 80),
    body: bodyFromBlocks(blocks),
    blocks,
  };
}

function bodyFromBlocks(blocks: readonly OutlineBlock[]): string {
  for (const block of blocks) {
    if (block.type === 'text') return block.markdown.slice(0, 280);
    if (block.type === 'heading') return block.text.slice(0, 280);
    if (block.type === 'callout') return block.body.slice(0, 280);
    if (block.type === 'quote') return block.quote.slice(0, 280);
    if (block.type === 'list' && block.items[0]) return block.items[0].slice(0, 280);
    if (block.type === 'cta') return block.label.slice(0, 280);
  }
  return 'Add content here.';
}

/**
 * Interactive or backend features a page/doc outline will not invent.
 * Callers surface these in rationale so agents do not treat them as shipped.
 */
export function detectPageDocOmissions(brief: string): string[] {
  const n = normalize(brief);
  const omissions: string[] = [];
  const add = (line: string) => {
    if (!omissions.includes(line)) omissions.push(line);
  };

  if (
    hasPhrase(n, 'contact form') ||
    hasPhrase(n, 'signup form') ||
    hasPhrase(n, 'sign up form') ||
    hasPhrase(n, 'registration form') ||
    hasPhrase(n, 'waitlist form') ||
    (hasPhrase(n, 'form') && (hasPhrase(n, 'submit') || hasPhrase(n, 'collect')))
  ) {
    add(
      'Interactive forms and response storage are omitted — @protoyard/pages owns form persistence.'
    );
  }
  if (
    hasPhrase(n, 'live poll') ||
    hasPhrase(n, 'audience poll') ||
    hasPhrase(n, 'quiz') ||
    hasPhrase(n, 'survey')
  ) {
    add(
      'Live polls, quizzes and surveys are omitted from page/doc outlines (use deck blocks or apps).'
    );
  }
  if (
    hasPhrase(n, 'payment') ||
    hasPhrase(n, 'checkout') ||
    hasPhrase(n, 'stripe') ||
    hasPhrase(n, 'billing')
  ) {
    add(
      'Payments and checkout are omitted — simulated billing stays in the SaaS kit, not page outlines.'
    );
  }
  if (
    hasPhrase(n, 'login') ||
    hasPhrase(n, 'sign in') ||
    hasPhrase(n, 'sso') ||
    hasPhrase(n, 'oauth') ||
    hasPhrase(n, 'authentication')
  ) {
    add('Authentication and SSO are omitted — use an app or SaaS kit blueprint for sign-in flows.');
  }
  if (
    hasPhrase(n, 'real time') ||
    hasPhrase(n, 'realtime') ||
    hasPhrase(n, 'websocket') ||
    hasPhrase(n, 'live chat')
  ) {
    add('Real-time chat and websockets are omitted — content kinds stay static drafts.');
  }
  if (
    hasPhrase(n, 'api') &&
    (hasPhrase(n, 'backend') || hasPhrase(n, 'server') || hasPhrase(n, 'database'))
  ) {
    add('Backend APIs and databases are omitted — blueprints stay data-only with no network.');
  }
  if (hasPhrase(n, 'crm') || hasPhrase(n, 'entities') || hasPhrase(n, 'roles and permissions')) {
    add('App entities and roles are omitted — page/doc kinds have no entity model.');
  }

  return omissions;
}

/** Choose a page outline family from brief cues (deterministic). */
export function selectPageOutline(brief: string): PageOutlineId {
  const n = normalize(brief);
  // Landing / marketing pages win even when they also mention pricing tiers.
  if (
    hasPhrase(n, 'landing page') ||
    hasPhrase(n, 'marketing page') ||
    hasPhrase(n, 'marketing site') ||
    hasPhrase(n, 'product page') ||
    hasPhrase(n, 'sales page') ||
    hasPhrase(n, 'splash page') ||
    hasPhrase(n, 'homepage') ||
    hasPhrase(n, 'home page') ||
    hasPhrase(n, 'microsite')
  ) {
    return 'landing';
  }
  if (
    hasPhrase(n, 'pricing page') ||
    hasPhrase(n, 'plans and pricing') ||
    hasPhrase(n, 'plan comparison') ||
    (hasPhrase(n, 'pricing') && (hasPhrase(n, 'plans') || hasPhrase(n, 'tiers')))
  ) {
    return 'pricing';
  }
  if (
    hasPhrase(n, 'waitlist') ||
    hasPhrase(n, 'coming soon') ||
    hasPhrase(n, 'launch page') ||
    hasPhrase(n, 'early access')
  ) {
    return 'waitlist';
  }
  return 'generic';
}

/** Choose a doc outline family from brief cues (deterministic). */
export function selectDocOutline(brief: string): DocOutlineId {
  const n = normalize(brief);
  if (
    hasPhrase(n, 'one pager') ||
    hasPhrase(n, 'one-pager') ||
    hasPhrase(n, 'onepagers') ||
    hasPhrase(n, 'one pagers')
  ) {
    return 'one-pager';
  }
  if (
    hasPhrase(n, 'handbook') ||
    hasPhrase(n, 'playbook') ||
    hasPhrase(n, 'style guide') ||
    hasPhrase(n, 'employee guide')
  ) {
    return 'handbook';
  }
  if (
    hasPhrase(n, 'proposal') ||
    hasPhrase(n, 'rfp') ||
    hasPhrase(n, 'statement of work') ||
    hasPhrase(n, 'sow')
  ) {
    return 'proposal';
  }
  if (
    hasPhrase(n, 'quarterly report') ||
    hasPhrase(n, 'status report') ||
    hasPhrase(n, 'annual report') ||
    hasPhrase(n, 'the report') ||
    hasPhrase(n, 'a report') ||
    hasPhrase(n, 'write the report') ||
    hasPhrase(n, 'report covering') ||
    hasPhrase(n, 'report for') ||
    hasPhrase(n, 'whitepaper') ||
    hasPhrase(n, 'research brief')
  ) {
    return 'report';
  }
  return 'generic';
}

function placeholder(topic: string): string {
  return `Add ${topic} here. Draft scaffolding only — no fabricated facts.`;
}

function buildPageSections(outline: PageOutlineId, title: string): OutlineSection[] {
  switch (outline) {
    case 'landing':
      return [
        section('section-hero', 'hero', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: placeholder('the hero claim and supporting line') },
          { type: 'cta', label: 'Primary action', href: '#get-started' },
        ]),
        section('section-features', 'features', 'Features', [
          { type: 'heading', text: 'Features', level: 2 },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Feature one — replace with a real benefit',
              'Feature two — replace with a real benefit',
              'Feature three — replace with a real benefit',
            ],
          },
        ]),
        section('section-social', 'social-proof', 'What people say', [
          { type: 'heading', text: 'What people say', level: 2 },
          { type: 'quote', quote: 'Add a short testimonial.', cite: 'Example customer' },
        ]),
        section('section-cta', 'cta', 'Get started', [
          { type: 'heading', text: 'Get started', level: 2 },
          { type: 'text', markdown: placeholder('a closing invite') },
          { type: 'cta', label: 'Get started', href: '#get-started' },
        ]),
        section('section-footer', 'footer', 'Footer', [
          { type: 'divider', label: 'Footer' },
          { type: 'text', markdown: placeholder('contact or legal links') },
        ]),
      ];
    case 'pricing':
      return [
        section('section-hero', 'hero', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: placeholder('who the plans are for') },
        ]),
        section('section-plans', 'pricing', 'Plans', [
          { type: 'heading', text: 'Plans', level: 2 },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Starter — placeholder tier',
              'Team — placeholder tier',
              'Business — placeholder tier',
            ],
          },
          {
            type: 'callout',
            title: 'Pricing is draft',
            body: 'Replace tiers with real numbers before publish. Nothing here is billed.',
          },
        ]),
        section('section-compare', 'comparison', 'Compare', [
          { type: 'heading', text: 'Compare', level: 2 },
          { type: 'text', markdown: placeholder('a short comparison of plan limits') },
        ]),
        section('section-cta', 'cta', 'Choose a plan', [
          { type: 'cta', label: 'Choose a plan', href: '#plans' },
        ]),
        section('section-footer', 'footer', 'Footer', [
          { type: 'text', markdown: placeholder('contact or FAQ link') },
        ]),
      ];
    case 'waitlist':
      return [
        section('section-hero', 'hero', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: placeholder('what is coming and when') },
          { type: 'cta', label: 'Join the waitlist', href: '#waitlist' },
        ]),
        section('section-why', 'body', 'Why it matters', [
          { type: 'heading', text: 'Why it matters', level: 2 },
          { type: 'list', style: 'bullet', items: ['Benefit one', 'Benefit two', 'Benefit three'] },
        ]),
        section('section-cta', 'cta', 'Stay in the loop', [
          {
            type: 'callout',
            title: 'Waitlist capture',
            body: 'Form fields are omitted here; wire a pages form when you need responses.',
          },
          { type: 'cta', label: 'Notify me', href: '#waitlist' },
        ]),
        section('section-footer', 'footer', 'Footer', [
          { type: 'text', markdown: placeholder('contact') },
        ]),
      ];
    default:
      return [
        section('section-hero', 'hero', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: 'Hero placeholder.' },
        ]),
        section('section-body', 'body', 'Details', [
          { type: 'heading', text: 'Details', level: 2 },
          { type: 'text', markdown: 'Add the main page sections here.' },
        ]),
        section('section-footer', 'footer', 'Footer', [
          { type: 'text', markdown: 'Contact or links placeholder.' },
        ]),
      ];
  }
}

function buildDocSections(outline: DocOutlineId, title: string): OutlineSection[] {
  switch (outline) {
    case 'report':
      return [
        section('section-title', 'title', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: placeholder('report subtitle or period') },
        ]),
        section('section-summary', 'summary', 'Executive summary', [
          { type: 'heading', text: 'Executive summary', level: 2 },
          { type: 'text', markdown: 'One-paragraph summary placeholder.' },
        ]),
        section('section-status', 'status', 'Status', [
          { type: 'heading', text: 'Status', level: 2 },
          {
            type: 'stat',
            items: [
              { value: '—', label: 'Metric one' },
              { value: '—', label: 'Metric two' },
              { value: '—', label: 'Metric three' },
            ],
          },
          { type: 'text', markdown: placeholder('what changed this period') },
        ]),
        section('section-findings', 'findings', 'Findings', [
          { type: 'heading', text: 'Findings', level: 2 },
          {
            type: 'list',
            style: 'number',
            items: ['Finding one — replace with evidence', 'Finding two — replace with evidence'],
          },
        ]),
        section('section-next', 'next-steps', 'Next steps', [
          { type: 'heading', text: 'Next steps', level: 2 },
          {
            type: 'list',
            style: 'check',
            items: ['Action one', 'Action two', 'Action three'],
          },
        ]),
      ];
    case 'handbook':
      return [
        section('section-title', 'title', title, [{ type: 'heading', text: title, level: 1 }]),
        section('section-summary', 'summary', 'How to use this guide', [
          { type: 'heading', text: 'How to use this guide', level: 2 },
          { type: 'text', markdown: placeholder('audience and scope') },
        ]),
        section('section-toc', 'toc', 'Contents', [
          { type: 'heading', text: 'Contents', level: 2 },
          {
            type: 'list',
            style: 'number',
            items: ['Chapter one', 'Chapter two', 'Chapter three'],
          },
        ]),
        section('section-body', 'body', 'Chapters', [
          { type: 'heading', text: 'Chapters', level: 2 },
          { type: 'text', markdown: placeholder('the first chapter body') },
          { type: 'divider', label: 'Next chapter' },
          { type: 'text', markdown: placeholder('the next chapter body') },
        ]),
        section('section-appendix', 'appendix', 'Appendix', [
          { type: 'heading', text: 'Appendix', level: 2 },
          { type: 'text', markdown: placeholder('glossary or links') },
        ]),
      ];
    case 'one-pager':
      return [
        section('section-title', 'title', title, [{ type: 'heading', text: title, level: 1 }]),
        section('section-summary', 'summary', 'At a glance', [
          { type: 'heading', text: 'At a glance', level: 2 },
          { type: 'text', markdown: 'One-paragraph summary placeholder.' },
        ]),
        section('section-body', 'body', 'Details', [
          { type: 'heading', text: 'Details', level: 2 },
          {
            type: 'list',
            style: 'bullet',
            items: ['Point one', 'Point two', 'Point three'],
          },
        ]),
        section('section-cta', 'cta', 'Next step', [
          { type: 'cta', label: 'Next step', href: '#next' },
        ]),
      ];
    case 'proposal':
      return [
        section('section-title', 'title', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: placeholder('client and date') },
        ]),
        section('section-summary', 'summary', 'Overview', [
          { type: 'heading', text: 'Overview', level: 2 },
          { type: 'text', markdown: placeholder('problem and proposed approach') },
        ]),
        section('section-scope', 'scope', 'Scope', [
          { type: 'heading', text: 'Scope', level: 2 },
          {
            type: 'list',
            style: 'bullet',
            items: ['In scope item', 'In scope item', 'Out of scope item'],
          },
        ]),
        section('section-timeline', 'timeline', 'Timeline', [
          { type: 'heading', text: 'Timeline', level: 2 },
          {
            type: 'list',
            style: 'number',
            items: ['Phase one', 'Phase two', 'Phase three'],
          },
        ]),
        section('section-next', 'next-steps', 'Decision', [
          { type: 'heading', text: 'Decision', level: 2 },
          { type: 'text', markdown: placeholder('the ask and how to accept') },
        ]),
      ];
    default:
      return [
        section('section-title', 'title', title, [
          { type: 'heading', text: title, level: 1 },
          { type: 'text', markdown: 'Document title block.' },
        ]),
        section('section-summary', 'summary', 'Summary', [
          { type: 'heading', text: 'Summary', level: 2 },
          { type: 'text', markdown: 'One-paragraph summary placeholder.' },
        ]),
        section('section-body', 'body', 'Body', [
          { type: 'heading', text: 'Body', level: 2 },
          { type: 'text', markdown: 'Add the main document sections here.' },
        ]),
      ];
  }
}

function outlineRationale(
  kind: 'page' | 'doc',
  outline: string,
  omissions: readonly string[]
): string[] {
  const lines = [
    `${titleCase(kind)} outline: ${outline}.`,
    'Sections use the bounded block vocabulary (heading, text, list, cta, stat, quote, callout, divider).',
    'Draft scaffolding only — no fabricated facts, no app entities or roles.',
  ];
  for (const omission of omissions) lines.push(`Omission: ${omission}`);
  if (omissions.length === 0) {
    lines.push('No interactive backend features were requested beyond static content.');
  }
  return lines;
}

/** Build a deterministic page outline from a brief. */
export function buildPageOutline(
  brief: string,
  options: OutlineBuildOptions = {}
): PageOutlineResult {
  const source = brief.slice(0, 5_000);
  const outline = selectPageOutline(source);
  const title = pickTitle(source, 'page', options.title);
  const omissions = detectPageDocOmissions(source);
  const sections = buildPageSections(outline, title);
  return {
    outline,
    title,
    sections,
    omissions,
    rationale: outlineRationale('page', outline, omissions),
  };
}

/** Build a deterministic doc outline from a brief. */
export function buildDocOutline(
  brief: string,
  options: OutlineBuildOptions = {}
): DocOutlineResult {
  const source = brief.slice(0, 5_000);
  const outline = selectDocOutline(source);
  const title = pickTitle(source, 'doc', options.title);
  const omissions = detectPageDocOmissions(source);
  const sections = buildDocSections(outline, title);
  return {
    outline,
    title,
    sections,
    omissions,
    rationale: outlineRationale('doc', outline, omissions),
  };
}

/** Stable ordered section ids for assertions and lint. */
export function sectionIds(sections: readonly OutlineSection[]): string[] {
  return sections.map((s) => s.id);
}
