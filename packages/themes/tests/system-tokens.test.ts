import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../src/base.css'), 'utf8');
const resolveCss = (id: string) => readFileSync(createRequire(import.meta.url).resolve(id), 'utf8');
const texuliSystem = resolveCss('@texuli/tokens/system.css');
const texuliBase = resolveCss('@texuli/tokens/base.css');

/** The custom properties a stylesheet declares (`--tx-name:`). */
const declared = (source: string) =>
  new Set([...source.matchAll(/(--tx-[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string));

// Token contract v2 (Texuli 0.9): Texuli's components read system tokens such
// as `--tx-size-icon-sm` (a checkbox's size) with no fallback. Without their
// defaults those controls render with no size (crm-demo's filter checkboxes
// were invisible). Since Texuli 0.10.0 (G110) `@texuli/tokens/system.css`
// declares them alone, without base.css's reset, which Protoyard brings itself.
describe('Texuli system tokens', () => {
  it('base.css loads Texuli’s system token defaults, not its whole base layer, before its own rules', () => {
    const at = css.indexOf('@import "@texuli/tokens/system.css";');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(css.indexOf('@theme inline'));
    expect(css).not.toContain('@import "@texuli/tokens/base.css"');
  });

  it('system.css declares the system tokens Texuli’s controls size themselves with', () => {
    for (const token of ['--tx-size-icon-sm', '--tx-space-unit', '--tx-shape-radius-sm'])
      expect(texuliSystem).toContain(`${token}:`);
  });

  it('every token only base.css declares is one Protoyard covers another way', () => {
    const covered = new Set([...declared(texuliSystem), ...declared(css)]);
    // base.css-only tokens: host viewport (every component read has a
    // fallback), motion easings and springs (the motion runtime reads JS
    // constants), the glass fills (Protoyard declares them under
    // `data-py-surface`) and the focus ring (applyAppearance writes it).
    const baseOnly = [...declared(texuliBase)].filter((token) => !covered.has(token));
    for (const token of baseOnly)
      expect(token).toMatch(/^--tx-(app-|safe-|motion-|surface-fill|elevated-fill|focus-ring-)/);
  });
});
