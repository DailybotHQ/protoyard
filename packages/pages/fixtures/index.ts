import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DocDocument,
  DocDocumentSchema,
  type PageDocument,
  PageDocumentSchema,
} from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(here, name), 'utf8')) as unknown;
}

/** Marketing landing fixture (hero, stats, CTA, waitlist form). */
export const LANDING_PAGE_FIXTURE_FILE = 'landing-page.json';

/** One-pager doc fixture (TOC headings, table, chart, quote). */
export const ONE_PAGER_DOC_FIXTURE_FILE = 'one-pager-doc.json';

/** Load and validate the landing page fixture. Throws on schema failure. */
export function loadLandingPageFixture(): PageDocument {
  return PageDocumentSchema.parse(readJson(LANDING_PAGE_FIXTURE_FILE));
}

/** Load and validate the one-pager doc fixture. Throws on schema failure. */
export function loadOnePagerDocFixture(): DocDocument {
  return DocDocumentSchema.parse(readJson(ONE_PAGER_DOC_FIXTURE_FILE));
}

/** All internal fixture file names shipped with the package. */
export const PAGE_FIXTURE_FILES = [LANDING_PAGE_FIXTURE_FILE, ONE_PAGER_DOC_FIXTURE_FILE] as const;
