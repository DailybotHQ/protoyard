import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Same order and ports as playwright.config.ts. */
export const PROTOTYPE_TARGETS = (process.env.PROTOYARD_E2E_PROTOTYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function prototypeUrl(slug: string): string {
  const i = PROTOTYPE_TARGETS.indexOf(slug);
  if (i === -1) throw new Error(`${slug} is not in PROTOYARD_E2E_PROTOTYPES`);
  return `http://127.0.0.1:${4401 + i}/`;
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
