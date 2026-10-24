import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CASCADE_LAYER_ORDER } from '../src/vite.ts';

/*
 * Texuli's styled components live in `@layer tx.base, tx.components`. Cascade
 * layer order is fixed by first appearance, so a Texuli stylesheet loaded
 * before Tailwind's would put those layers below Tailwind's base, whose reset
 * (`button { padding: 0 }`) would then win. Every page declares the order
 * first.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');

describe('cascade layer order', () => {
  it('puts Texuli components between Tailwind base and utilities', () => {
    const layers = CASCADE_LAYER_ORDER.replace(/^@layer |;$/g, '').split(', ');
    expect(layers.indexOf('base')).toBeLessThan(layers.indexOf('tx.components'));
    expect(layers.indexOf('tx.components')).toBeLessThan(layers.indexOf('utilities'));
  });

  it('is declared before Tailwind in the prototype stylesheet', () => {
    const css = read('packages/renderer-svelte/src/app.css');
    expect(css.indexOf(CASCADE_LAYER_ORDER)).toBeGreaterThan(-1);
    expect(css.indexOf(CASCADE_LAYER_ORDER)).toBeLessThan(css.indexOf('@import "tailwindcss"'));
  });

  it.each(['index', 'deck', 'page', 'doc'])(
    'is the first style of the player %s.html head',
    (page) => {
      const html = read(`packages/player/${page}.html`);
      const first = html.search(/<style|<link rel="stylesheet"|<script type="module"/);
      expect(html.slice(first)).toMatch(/^<style>@layer theme, base, tx\.base, tx\.components/);
    }
  );
});
