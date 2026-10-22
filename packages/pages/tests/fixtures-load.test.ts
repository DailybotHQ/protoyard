import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LANDING_PAGE_FIXTURE_FILE,
  loadLandingPageFixture,
  loadOnePagerDocFixture,
  ONE_PAGER_DOC_FIXTURE_FILE,
  PAGE_FIXTURE_FILES,
} from '../fixtures/index.ts';
import { DocDocumentSchema, PageDocumentSchema } from '../src/schema.ts';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

function raw(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

/** Domains and hosts that are allowed in fictional fixtures. */
const ALLOWED_HOST = /(?:^|[.@/])(?:[a-z0-9-]+\.)*example\.com\b/i;

function assertExampleOnly(text: string, label: string): void {
  // No obvious real consumer domains; require example.com when a host appears.
  const hosts = text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi);
  if (!hosts) return;
  for (const host of hosts) {
    if (host.endsWith('.json')) continue;
    expect(ALLOWED_HOST.test(host), `${label} host ${host}`).toBe(true);
  }
  expect(text).not.toMatch(/@gmail\.com|@yahoo\.com|@hotmail\.com/i);
}

describe('page and doc fixtures', () => {
  it('lists the shipped fixture files', () => {
    expect(PAGE_FIXTURE_FILES).toEqual([LANDING_PAGE_FIXTURE_FILE, ONE_PAGER_DOC_FIXTURE_FILE]);
  });

  it('parses the landing page with PageDocumentSchema', () => {
    const page = loadLandingPageFixture();
    expect(page.id).toBe('harbor-landing');
    expect(page.sections.some((section) => section.role === 'hero')).toBe(true);
    expect(page.sections.some((section) => section.blocks.some((b) => b.type === 'stat'))).toBe(
      true
    );
    expect(page.sections.some((section) => section.blocks.some((b) => b.type === 'cta'))).toBe(
      true
    );
    expect(page.forms?.[0]?.formId).toBe('waitlist-form');
    expect(PageDocumentSchema.safeParse(page).success).toBe(true);

    const json = raw(LANDING_PAGE_FIXTURE_FILE);
    assertExampleOnly(json, 'landing-page');
    expect(json).toMatch(/example\.com/);
  });

  it('parses the one-pager doc with DocDocumentSchema', () => {
    const doc = loadOnePagerDocFixture();
    expect(doc.id).toBe('pebble-q3-report');
    expect(doc.toc?.sticky).toBe(true);
    expect(doc.print?.pageBreaks).toBe('heading');
    expect(doc.blocks.some((b) => b.type === 'heading')).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'table')).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'chart')).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'quote')).toBe(true);
    expect(DocDocumentSchema.safeParse(doc).success).toBe(true);

    const json = raw(ONE_PAGER_DOC_FIXTURE_FILE);
    assertExampleOnly(json, 'one-pager-doc');
    expect(json).toMatch(/example\.com/);
  });

  it('rejects tampering that breaks the schema', () => {
    const page = loadLandingPageFixture();
    expect(PageDocumentSchema.safeParse({ ...page, sections: [] }).success).toBe(false);
    const doc = loadOnePagerDocFixture();
    expect(DocDocumentSchema.safeParse({ ...doc, extra: true }).success).toBe(false);
  });
});
