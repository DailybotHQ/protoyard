import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Same order and ports as playwright.config.ts. */
export const PROTOTYPE_TARGETS = (process.env.PROTOYARD_E2E_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** PLAN_002 flagship SaaS browser journey. */
export const LATTICE_SAAS_DEMO = 'lattice-saas-demo';

/** PLAN_002 flagship generated from a blueprint (`protoyard generate`). */
export const HELPDESK_DEMO = 'helpdesk-demo';

/** PLAN_003 flagship product analytics (charts + analytics kits). */
export const PEBBLESTAT_DEMO = 'pebblestat-analytics-demo';

/** PLAN_003 artifact-pack browser harness target. */
export const ARTIFACT_PACK_TARGET = 'relay-chat-demo';

/** Authored examples exercised through the hosted player's four content-kind entries. */
export const SHOWCASE_KIND_TARGETS = [
  {
    kind: 'app',
    path: 'blueprints/quick/analytics.json',
    root: 'main',
    heading: 'Metrics',
  },
  {
    kind: 'deck',
    path: 'blueprints/decks/cedar-training.json',
    root: '[data-py-deck-app]',
    heading: 'Cedar Desk training',
    nextSlide: 'agenda',
  },
  {
    kind: 'page',
    path: 'blueprints/pages/tidewater-roasters-landing.json',
    root: '[data-py-page-app]',
    heading: 'Fresh beans at your door every two weeks',
  },
  {
    kind: 'doc',
    path: 'blueprints/docs/northwind-quarterly-report.json',
    root: '[data-py-doc-app]',
    heading: 'Northwind support quarterly report',
  },
] as const;

/** Marketplace examples: each share link must boot its matching player renderer. */
export const MARKETPLACE_CONTENT_KIND_TARGETS = [
  { kind: 'app', label: 'App', renderer: 'main', action: 'Open in player' },
  {
    kind: 'deck',
    label: 'Deck',
    renderer: '[data-py-deck-app]',
    action: 'Open Deck in player',
  },
  {
    kind: 'page',
    label: 'Page',
    renderer: '[data-py-page-app]',
    action: 'Open Page in player',
  },
  {
    kind: 'doc',
    label: 'Document',
    renderer: '[data-py-doc-app]',
    action: 'Open Document in player',
  },
] as const;

export type MarketplaceContentKind = (typeof MARKETPLACE_CONTENT_KIND_TARGETS)[number]['kind'];

export type ShowcaseKindTarget = (typeof SHOWCASE_KIND_TARGETS)[number];

export function readShowcaseKindBlueprint(target: ShowcaseKindTarget): string {
  return readFileSync(join(process.cwd(), target.path), 'utf8');
}

/** First prototype port (default 4401). Override for private verification servers. */
const PROTOTYPE_PORT_BASE = Number(process.env.PROTOYARD_E2E_PROTOTYPE_PORT_BASE ?? 4401);

export function prototypeUrl(slug: string): string {
  const i = PROTOTYPE_TARGETS.indexOf(slug);
  if (i === -1) throw new Error(`${slug} is not in PROTOYARD_E2E_PROTOTYPES`);
  return `http://127.0.0.1:${PROTOTYPE_PORT_BASE + i}/`;
}

/**
 * Review-comments E2E (tests/e2e/review-comments.spec.ts): prototypes built
 * with PROTOYARD_REVIEW=1 (local adapter, no DevTools) on their own ports, so
 * they never collide with the ordinary builds above. Not PROTOYARD_E2E_REVIEW,
 * which serves the publish review index.
 */
export const COMMENTS_TARGETS = (process.env.PROTOYARD_E2E_COMMENTS_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** First review-comments build port (default 4601). */
export const COMMENTS_PORT_BASE = Number(process.env.PROTOYARD_E2E_COMMENTS_PORT_BASE ?? 4601);

/**
 * The shared-adapter server (default 4651): the FIRST comments target built
 * with PROTOYARD_REVIEW_ADAPTER=http and served together with
 * `handleCommentsRequest` on an in-memory store (tests/e2e/support/serve-comments.ts).
 */
export const COMMENTS_SHARED_PORT = Number(process.env.PROTOYARD_E2E_COMMENTS_SHARED_PORT ?? 4651);

export function commentsUrl(slug: string): string {
  const i = COMMENTS_TARGETS.indexOf(slug);
  if (i === -1) throw new Error(`${slug} is not in PROTOYARD_E2E_COMMENTS_PROTOTYPES`);
  return `http://127.0.0.1:${COMMENTS_PORT_BASE + i}/`;
}

export function commentsSharedUrl(): string {
  return `http://127.0.0.1:${COMMENTS_SHARED_PORT}/`;
}

export interface LayoutMatrixTarget {
  slug: 'atlas-workspace-demo' | 'relay-chat-demo';
  scenario: string;
  navigationRoute: string;
  primaryRoute: string;
  primaryInput: string;
  fit: 'document' | 'viewport';
  navigation: 'layout-links' | 'relay-channels';
  layouts: string[];
}

const LAYOUT_MATRIX_CONFIG = [
  {
    slug: 'atlas-workspace-demo',
    scenario: 'massive',
    navigationRoute: '#/layouts',
    primaryRoute: '#/customers',
    primaryInput: 'input[placeholder^="Search name, email, company"]',
    fit: 'document',
    navigation: 'layout-links',
  },
  {
    slug: 'relay-chat-demo',
    scenario: 'busy-day',
    navigationRoute: '#/',
    primaryRoute: '#/',
    primaryInput: '[data-py-composer]',
    fit: 'viewport',
    navigation: 'relay-channels',
  },
] as const;

interface PrototypeLayoutManifest {
  preview?: { layout?: { id?: string; supported?: string[] } };
}

function supportedLayouts(slug: string): string[] {
  const manifestPath = join(process.cwd(), 'prototypes', slug, 'protoyard.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PrototypeLayoutManifest;
  const layout = manifest.preview?.layout;
  if (!layout) return ['custom'];
  return [...new Set([layout.id ?? 'custom', ...(layout.supported ?? [])])];
}

/** Layout-matrix cases, limited to configured E2E targets and each manifest's supported layouts. */
export function layoutMatrixTargets(): LayoutMatrixTarget[] {
  return LAYOUT_MATRIX_CONFIG.filter(({ slug }) => PROTOTYPE_TARGETS.includes(slug)).map(
    (target) => ({ ...target, layouts: supportedLayouts(target.slug) })
  );
}

/** Slugs served as DevTools builds (PROTOYARD_E2E_DEVTOOLS_PROTOTYPES, see playwright.config.ts). */
export const DEVTOOLS_TARGETS = (process.env.PROTOYARD_E2E_DEVTOOLS_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DEVTOOLS_PORT_BASE = Number(process.env.PROTOYARD_E2E_DEVTOOLS_PORT_BASE ?? 4451);

export function devtoolsPrototypeUrl(slug: string): string {
  const i = DEVTOOLS_TARGETS.indexOf(slug);
  if (i === -1) throw new Error(`${slug} is not in PROTOYARD_E2E_DEVTOOLS_PROTOTYPES`);
  return `http://127.0.0.1:${DEVTOOLS_PORT_BASE + i}/`;
}

export interface RegistryEntryLite {
  kind: 'prototype' | 'template' | 'blueprint';
  slug: string;
  name: string;
  tags: string[];
  scenarios: string[];
  blueprintKind?: MarketplaceContentKind | null;
  catalog?: { category?: string; features?: string[] } | null;
}

/** The registry the gallery was built from (the webServer re-indexes first). */
export function readRegistry(): { entries: RegistryEntryLite[] } | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), '.protoyard', 'registry.json'), 'utf8'));
  } catch {
    return null;
  }
}
