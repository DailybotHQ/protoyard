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

/** First prototype port (default 4401). Override for private verification servers. */
const PROTOTYPE_PORT_BASE = Number(process.env.PROTOYARD_E2E_PROTOTYPE_PORT_BASE ?? 4401);

export function prototypeUrl(slug: string): string {
  const i = PROTOTYPE_TARGETS.indexOf(slug);
  if (i === -1) throw new Error(`${slug} is not in PROTOYARD_E2E_PROTOTYPES`);
  return `http://127.0.0.1:${PROTOTYPE_PORT_BASE + i}/`;
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
