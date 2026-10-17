import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PROTOTYPE_TARGETS } from './targets.ts';

/**
 * Flow 10: building another prototype must not bundle the CRM's data or code.
 * The webServer entries built every target into artifacts/<slug>/dist; scan
 * the static output of each non-CRM target for CRM-only markers.
 */
/**
 * CRM-only markers: its bundled manifest (id/namespace as properties — a bare
 * "example.crm" also appears in a core error-message example) and UI strings
 * no other demo uses. Function names are not used: minification renames them.
 */
const CRM_MARKERS: [string, RegExp][] = [
  ['manifest id', /\bid\s*:\s*["'`]example\.crm["'`]/],
  ['storage namespace', /\bnamespace\s*:\s*["'`]crm-demo["'`]/],
  ['product name', /Pipeline CRM/],
  ['CRM UI copy', /Create company/],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Pure file-system checks: run them once, not once per browser project. */
function chromiumOnly() {
  test.skip(test.info().project.name !== 'chromium', 'file-system check: chromium project only');
}

const others = PROTOTYPE_TARGETS.filter((slug) => slug !== 'crm-demo');

test.describe('build isolation', () => {
  test.skip(
    !PROTOTYPE_TARGETS.includes('crm-demo') || others.length === 0,
    'needs crm-demo and at least one other target'
  );

  for (const slug of others) {
    test(`${slug} bundles no CRM code or data`, () => {
      chromiumOnly();
      const dist = join(process.cwd(), 'artifacts', slug, 'dist');
      expect(existsSync(join(dist, 'index.html')), `${slug} was built`).toBe(true);
      const hits: string[] = [];
      for (const file of files(dist).filter((f) => /\.(m?js|css|html|json)$/.test(f))) {
        const text = readFileSync(file, 'utf8');
        for (const [label, pattern] of CRM_MARKERS) {
          if (pattern.test(text)) hits.push(`${file.slice(dist.length + 1)}: ${label}`);
        }
      }
      expect(hits).toEqual([]);
    });
  }

  test('the CRM build itself contains its own markers (the scan is meaningful)', () => {
    chromiumOnly();
    const dist = join(process.cwd(), 'artifacts', 'crm-demo', 'dist');
    const text = files(dist)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const [label, pattern] of CRM_MARKERS) expect(pattern.test(text), label).toBe(true);
  });
});
