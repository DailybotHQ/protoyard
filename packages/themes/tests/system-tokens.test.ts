import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../src/base.css'), 'utf8');
const texuliBase = readFileSync(
  createRequire(import.meta.url).resolve('@texuli/tokens/base.css'),
  'utf8'
);

// Token contract v2 (Texuli 0.9): Texuli's components read system tokens such
// as `--tx-size-icon-sm` (a checkbox's size) with no fallback, and only
// `@texuli/tokens/base.css` declares their defaults. Without it those
// controls render with no size (crm-demo's filter checkboxes were invisible).
describe('Texuli system tokens', () => {
  it('base.css loads Texuli’s base layer before its own rules', () => {
    const at = css.indexOf('@import "@texuli/tokens/base.css";');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(css.indexOf('@theme inline'));
  });

  it('that file declares the system tokens Texuli’s controls size themselves with', () => {
    for (const token of ['--tx-size-icon-sm', '--tx-space-unit', '--tx-shape-radius-sm'])
      expect(texuliBase).toContain(`${token}:`);
  });
});
