// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Stepped catalog props (SlideFrame) animate their reveal unless the viewer
 * prefers reduced motion or the deck sets `motion: none`. A rule that drops
 * the transition must therefore be inside the reduced-motion media query or
 * be scoped by `[data-py-deck-motion='none']` in every one of its selectors.
 * A selector without that scope once removed every prop reveal transition,
 * for every deck, always.
 */

const source = readFileSync(
  resolve(import.meta.dirname, '../src/layouts/design/SlideFrame.svelte'),
  'utf8'
);
const css = source.slice(source.indexOf('<style>') + 7, source.indexOf('</style>'));

/** Top-level rules (outside @media) as `[selectors, body]`, comments removed. */
function topLevelRules(text: string): [string[], string][] {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: [string[], string][] = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '{') {
      if (depth === 0) selector = clean.slice(start, i).trim();
      depth++;
      if (depth === 1) start = i + 1;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        if (!selector.startsWith('@')) {
          rules.push([selector.split(',').map((s) => s.trim()), clean.slice(start, i)]);
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

describe('SlideFrame reveal motion', () => {
  it('drops a prop transition only for motion none, in every selector', () => {
    const dropping = topLevelRules(css).filter(([, body]) => /transition:\s*none/.test(body));
    expect(dropping.length).toBeGreaterThan(0);
    for (const [selectors] of dropping) {
      for (const selector of selectors) {
        expect(selector, selector).toContain("[data-py-deck-motion='none']");
      }
    }
  });

  it('keeps the reveal transition and drops it under reduced motion', () => {
    expect(css).toMatch(/transition:\s*opacity 500ms ease-out/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {2}\}/);
    expect(reduced?.[1]).toMatch(/transition:\s*none/);
  });
});
