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

    expect(page).toContain('title="Play a blueprint"');
    expect(page).toContain(
      'description="Paste a Protoyard blueprint or open a share link to run a working prototype in your browser."'
    );
    expect(page).toContain("canonicalPath={withBase('/play/')}");
    expect(layout).toContain('<meta name="description" content={description} />');
    expect(layout).toContain('<link rel="canonical" href={canonical} />');
    expect(layout).toContain('<meta property="og:title" content={fullTitle} />');
    expect(layout).toContain('<meta property="og:description" content={description} />');
    expect(layout).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(layout).toContain('new URL(canonicalPath ?? withBase(routePath), Astro.site).href');
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
