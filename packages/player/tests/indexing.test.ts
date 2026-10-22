// @vitest-environment node
/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { productionBuildEnv } from './support/build-env.ts';

/**
 * The standalone player (`/player/`, and every `/player/#bp=` share link) is an
 * app, not a landing page: search engines must not index it. The hosted `/play/`
 * route is the indexable landing page. Checked on a fresh build, never on a
 * stale `dist/`.
 */

const PLAYER = fileURLToPath(new URL('..', import.meta.url));
let outDir = '';
let html = '';

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), 'protoyard-player-indexing-'));
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: PLAYER,
    stdio: 'pipe',
    timeout: 240_000,
    env: productionBuildEnv(),
  });
  html = readFileSync(join(outDir, 'index.html'), 'utf8');
}, 300_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('player indexing', () => {
  it('tells crawlers not to index the built player', () => {
    const robots = [...html.matchAll(/<meta\s+name="robots"\s+content="([^"]*)"\s*\/?>/gi)].map(
      ([, content]) => content
    );
    expect(robots).toEqual(['noindex']);
    // Inside <head>, so crawlers read it before the app boots.
    expect(html.indexOf('name="robots"')).toBeLessThan(html.indexOf('</head>'));
  });
});
