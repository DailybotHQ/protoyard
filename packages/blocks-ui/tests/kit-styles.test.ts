import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BLOCK_TONES, type MapBlock } from '@protoyard/blocks';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TONE_FILL } from '../../views-ui/src/map/model.ts';
import MapBlockView from '../src/map/MapBlockView.svelte';
import { MAP_TONES, mapTone } from '../src/map/tones.ts';

// The map block's seam: the markers it hands to the lazy views-ui map.
vi.mock('@protoyard/views-ui/map', async () => ({
  SimulatedMap: (await import('./fixtures/MapCapture.svelte')).default,
}));

/*
 * What blocks need from the kits they render, at the source (PLAN_006 final
 * review): the map block once rendered unstyled on deck pages (no basemap, list
 * rows stacked, axe "button-name" on its list) because no host stylesheet
 * scanned views-ui's map; an `accent` place had no fill class; and a deck's
 * `motion: none` kept block reveal transitions where only decks-ui/player.css
 * carried the fragment rules.
 */

const SRC = resolve(import.meta.dirname, '../src');
const PACKAGES = resolve(import.meta.dirname, '../..');
const styles = readFileSync(join(SRC, 'styles.css'), 'utf8');

afterEach(cleanup);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|svelte)$/.test(name) ? [path] : [];
  });
}

/** `@source "./x"` entries of a kit stylesheet. */
function scanned(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/@source\s+"\.\/([^"]+)"/g)].map(
    (m) => m[1] ?? ''
  );
}

describe('blocks-ui stylesheet brings the kit styles its families render', () => {
  const imported = [
    ...new Set(
      sourceFiles(SRC).flatMap((file) =>
        [
          ...readFileSync(file, 'utf8').matchAll(/@protoyard\/(charts-ui|views-ui)\/([a-z-]+)/g),
        ].map((m) => `${m[1]}/${m[2]}`)
      )
    ),
  ].sort();

  it('imports the chart and view sheets for content blocks', () => {
    expect(styles).toContain('@import "@protoyard/charts-ui/player.css";');
    expect(styles).toContain('@import "@protoyard/views-ui/blocks.css";');
    // The families blocks-ui loads today (a new one must be scanned too).
    expect(imported).toEqual([
      'charts-ui/cartesian',
      'charts-ui/compact',
      'charts-ui/part-whole',
      'views-ui/map',
    ]);
  });

  it.each([
    ['charts-ui', 'charts-ui/src/player.css'],
    ['views-ui', 'views-ui/src/blocks.css'],
  ])('%s: every family blocks-ui imports is scanned by its sheet', (kit, sheet) => {
    const sources = scanned(join(PACKAGES, sheet));
    for (const family of imported.filter((entry) => entry.startsWith(`${kit}/`))) {
      const name = family.slice(kit.length + 1);
      expect(
        sources.some((source) => source === name || source.startsWith(`${name}/`)),
        `${family} is not scanned by ${sheet}`
      ).toBe(true);
    }
  });

  it('drops every fragment transition for reduced motion and a deck motion of none', () => {
    const reduced = styles.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.py-deck-fragment \{([^}]*)\}/
    );
    expect(reduced?.[1]).toMatch(/transition: none !important/);
    const none = styles.match(/\[data-py-deck-motion="none"\] \.py-deck-fragment \{([^}]*)\}/);
    expect(none?.[1]).toMatch(/transition: none !important/);
  });
});

describe('map block tones', () => {
  it('maps every block tone to a map tone that has a fill', () => {
    for (const tone of BLOCK_TONES) {
      expect(TONE_FILL[MAP_TONES[tone]], tone).toMatch(/^bg-/);
    }
    expect(mapTone(undefined)).toBe('primary');
    expect(mapTone('accent')).toBe('primary');
  });

  it('hands the map a filled tone for an accent place', async () => {
    const block: MapBlock = {
      type: 'map',
      id: 'stores',
      label: 'Stores on the simulated map',
      points: [
        { id: 'north', label: 'North pier', lng: -18.6, lat: -30.8, tone: 'accent' },
        { id: 'market', label: 'Market', lng: -18.4, lat: -31.1 },
      ],
    };
    const view = render(MapBlockView, { props: { block } });
    const north = await view.findByText('North pier', {}, { timeout: 10_000 });
    expect(north.getAttribute('data-tone')).toBe('primary');
    expect(view.getByText('Market').getAttribute('data-tone')).toBe('primary');
    for (const marker of view.container.querySelectorAll('[data-marker]')) {
      expect(TONE_FILL[marker.getAttribute('data-tone') as keyof typeof TONE_FILL]).toBeDefined();
    }
  }, 30_000);
});
