import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { syncShareRobots } from '../src/lib/play-robots.ts';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (path: string) => readFileSync(resolve(here, path), 'utf8');

describe('/play metadata and indexing', () => {
  it('declares stable landing-page title, description and base-aware canonical path', () => {
    const page = readSource('../src/pages/play.astro');
    const layout = readSource('../src/layouts/BaseLayout.astro');

    expect(page).toContain('title="Run a blueprint"');
    expect(page).toContain(
      'description="Run app, deck, page, or document blueprints in your browser. Paste JSON, open a share link, or load a local blueprint file; simulated data stays in this browser."'
    );
    expect(page).toContain('Run an app, deck, page, or document blueprint in this browser.');
    expect(page).toContain(
      'choose a local JSON file in the player. Simulated data stays in this browser.'
    );
    expect(page).not.toContain('working prototype');
    expect(page).toContain("canonicalPath={withBase('/play/')}");
    expect(layout).toContain('<meta name="description" content={description} />');
    expect(layout).toContain('<link rel="canonical" href={canonical} />');
    expect(layout).toContain('<meta property="og:title" content={fullTitle} />');
    expect(layout).toContain('<meta property="og:description" content={description} />');
    expect(layout).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(layout).toContain('new URL(canonicalPath ?? withBase(routePath), Astro.site).href');
  });

  it('keeps the hosted player embed and its accessible labels kind-neutral', () => {
    const playground = readSource('../src/components/player/Playground.svelte');

    expect(playground).toContain('Blueprint JSON (app, deck, page, or document)');
    expect(playground).toContain('title="Running Protoyard blueprint"');
    expect(playground).not.toContain('Running Protoyard prototype');
    expect(playground).toContain("target.searchParams.set('embedder', window.location.origin)");
    expect(playground).toContain('readBlueprintShareFragment(window.location.hash)');
    expect(playground).toContain('if (share) target.hash =');
    expect(playground).toContain('shareAvailable = hasDeflateRaw()');
  });

  it('keeps the landing page indexable and marks only share-fragment visits noindex', () => {
    const page = readSource('../src/pages/play.astro');

    expect(page).not.toContain('<BaseLayout noindex');
    expect(page).toContain('syncShareRobots(window.location.hash, document.head)');
    expect(page).toContain("window.addEventListener('hashchange', updateShareRobots)");
  });

  it('adds noindex for a share fragment and removes it when the fragment is cleared', () => {
    document.head.innerHTML = '';

    syncShareRobots('#bp=v1.payload', document.head);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex'
    );

    syncShareRobots('', document.head);
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
