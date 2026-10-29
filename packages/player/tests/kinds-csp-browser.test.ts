// @vitest-environment node
/**
 * Headless Chromium: each built kind player page (deck.html, page.html,
 * doc.html) opens a small fixture under the same Content-Security-Policy the
 * production build ships, reaches ready, and reports no CSP violation and no
 * page/console error.
 *
 * Lives in its own file so lane edits to security.test.ts NODE_ENV handling
 * do not collide. Reuses the static-file server + CSP header pattern from
 * security.test.ts.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AnyBlueprint, encodeBlueprintShare, parseAnyBlueprint } from '@protoyard/blueprint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensurePlayerBuild } from './support/serve-dist.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIST = join(ROOT, 'packages/player/dist/app');
const FIXTURES = join(ROOT, 'packages/blueprint/tests/fixtures/kinds');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

const KIND_PAGES = [
  {
    page: 'deck.html',
    kind: 'deck' as const,
    fixture: 'minimal.deck.json',
    content: '[data-tx-deck-slide], [data-py-deck-app]',
  },
  {
    page: 'page.html',
    kind: 'page' as const,
    fixture: 'landing.page.json',
    content: '[data-py-page-section], [data-py-page-app]',
  },
  {
    page: 'doc.html',
    kind: 'doc' as const,
    fixture: 'quarterly-report.doc.json',
    content: '[data-py-doc-block], [data-py-doc-app]',
  },
] as const;

async function loadFixture(name: string): Promise<AnyBlueprint> {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as unknown;
  return parseAnyBlueprint(raw);
}

describe('kind player pages under CSP in Chromium', () => {
  let headers = '';
  let server: Server | undefined;

  beforeAll(() => {
    ensurePlayerBuild(ROOT);
    headers = readFileSync(join(DIST, '_headers'), 'utf8');
  }, 600_000);

  afterAll(() => {
    server?.close();
  });

  it.each(KIND_PAGES)(
    'opens $page with a $kind fixture and stays clean under CSP',
    { timeout: 120_000 },
    async ({ page: entry, fixture, content }) => {
      let playwright: typeof import('@playwright/test');
      try {
        playwright = await import('@playwright/test');
      } catch {
        console.warn('kinds-csp-browser: Playwright is not installed; browser check skipped');
        return;
      }

      const cspHeader = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';
      expect(cspHeader.length, 'built player _headers must carry CSP').toBeGreaterThan(20);

      server?.close();
      server = createServer((request, response) => {
        const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0] as string));
        const file = join(DIST, path === '/' ? entry : path.replace(/^\//, ''));
        if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          'content-security-policy': cspHeader,
        });
        response.end(readFileSync(file));
      });
      await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
      const { port } = server.address() as AddressInfo;

      let browser: Awaited<ReturnType<typeof playwright.chromium.launch>>;
      try {
        browser = await playwright.chromium.launch();
      } catch (error) {
        console.warn(
          `kinds-csp-browser: Chromium unavailable (${String(error).split('\n')[0]}); skipped`
        );
        return;
      }

      try {
        const page = await browser.newPage();
        const violations: string[] = [];
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];

        await page.addInitScript(() => {
          document.addEventListener('securitypolicyviolation', (event) => {
            const bag = window as unknown as { __pyCspViolations?: string[] };
            bag.__pyCspViolations ??= [];
            bag.__pyCspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`);
          });
        });

        page.on('pageerror', (error) => {
          pageErrors.push(error.message);
        });
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          const text = message.text();
          consoleErrors.push(text);
          if (/Content Security Policy|Refused to/i.test(text)) {
            violations.push(text);
          }
        });
        page.on('worker', (worker) => {
          worker.on('console', (message) => {
            if (/Content Security Policy|unsafe-eval/i.test(message.text())) {
              violations.push(`worker: ${message.text()}`);
            }
          });
        });

        const blueprint = await loadFixture(fixture);
        const hash = `#bp=${await encodeBlueprintShare(blueprint)}`;
        await page.goto(`http://127.0.0.1:${port}/${entry}?devtools=0${hash}`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForSelector('html[data-protoyard-ready="1"]', { timeout: 60_000 });
        await page.waitForSelector(content, { timeout: 30_000 });

        const reported = await page.evaluate(
          () => (window as unknown as { __pyCspViolations?: string[] }).__pyCspViolations ?? []
        );

        expect(pageErrors, `${entry} pageerror`).toEqual([]);
        expect(
          consoleErrors.filter((line) => /Content Security Policy|Refused to/i.test(line)),
          `${entry} CSP console`
        ).toEqual([]);
        expect([...reported, ...violations], `${entry} CSP violations`).toEqual([]);
      } finally {
        await browser.close();
      }
    }
  );
});
