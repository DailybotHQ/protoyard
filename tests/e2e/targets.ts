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

/** First prototype port (default 4401). Override for private verification servers. */
const PROTOTYPE_PORT_BASE = Number(process.env.PROTOYARD_E2E_PROTOTYPE_PORT_BASE ?? 4401);

export function prototypeUrl(slug: string): string {
  const i = PROTOTYPE_TARGETS.indexOf(slug);
  if (i === -1) throw new Error(`${slug} is not in PROTOYARD_E2E_PROTOTYPES`);
  return `http://127.0.0.1:${PROTOTYPE_PORT_BASE + i}/`;
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
  kind: 'prototype' | 'template';
  slug: string;
  name: string;
  tags: string[];
  scenarios: string[];
}

/** The registry the gallery was built from (the webServer re-indexes first). */
export function readRegistry(): { entries: RegistryEntryLite[] } | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), '.protoyard', 'registry.json'), 'utf8'));
  } catch {
    return null;
  }
}
