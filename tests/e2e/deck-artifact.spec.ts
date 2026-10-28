import { expect, type Frame, type Page, test } from '@playwright/test';
import {
  type ArtifactHarnessServer,
  DECK_ARTIFACT_TARGET,
  FAKE_CLAUDE_INIT_SCRIPT,
  startArtifactHarnessServer,
} from './support/artifact-harness.ts';

/**
 * A deck exported with `protoyard export <slug> --target artifact`, opened the
 * way the Claude artifact viewer opens it: `page.html` is body content, which
 * the harness wraps in a document skeleton inside an iframe. It proves the
 * first slide renders, keyboard and hash navigation work, no split lazy chunk
 * with code of its own is fetched (the artifact target builds one script), the
 * host APIs a deck may touch (window.claude, the clipboard, IndexedDB) degrade
 * safely when absent, and the console stays free of errors.
 *
 * Local harness QA only: nothing is uploaded to Claude.
 */

let harness: ArtifactHarnessServer;

/** A Vite-emitted Web Worker bundle (`new Worker(new URL(…))`), not a code-split chunk. */
const WORKER_SCRIPT = /\.worker-[\w-]+\.js$/;

test.beforeAll(async () => {
  harness = await startArtifactHarnessServer({
    target: DECK_ARTIFACT_TARGET,
    frameTitle: 'Packed Create Anything deck',
  });
});

test.afterAll(async () => {
  await harness?.close();
});

interface Watch {
  errors: string[];
  scripts: { url: string; body: Promise<string> }[];
  failed: string[];
}

/** Records console errors, uncaught exceptions, failed requests and every packed script. */
function watch(page: Page): Watch {
  const seen: Watch = { errors: [], scripts: [], failed: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') seen.errors.push(message.text());
  });
  page.on('pageerror', (error) => seen.errors.push(String(error)));
  page.on('requestfailed', (request) => seen.failed.push(request.url()));
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400) seen.failed.push(`${response.status()} ${url}`);
    if (url.includes('/__packed__/') && new URL(url).pathname.endsWith('.js')) {
      // The test's own fetch() of each packed script lands here too, and its body
      // may still be pending when the test ends; Playwright then rejects it with
      // "Test ended". Settle it, so only an awaited body can fail the test.
      const body = response.text();
      body.catch(() => undefined);
      seen.scripts.push({ url, body });
    }
  });
  return seen;
}

async function openDeck(
  page: Page,
  options: { hash?: string; noClaude?: boolean; blockStorage?: boolean } = {}
): Promise<Frame> {
  const params = new URLSearchParams();
  if (options.noClaude) params.set('noClaude', '1');
  if (options.blockStorage) params.set('blockStorage', '1');
  const query = params.size > 0 ? `?${params.toString()}` : '';
  await page.goto(`${harness.url}${query}${options.hash ?? '#/'}`);
  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes('/__packed__/page.html'));
  if (!frame) throw new Error('The artifact harness did not load its packed iframe');
  // A deck that never gets ready is a blank artifact (a top-level await on a
  // lazy import deadlocks a single-chunk build, which also logs nothing).
  await expect(frame.locator('html'), 'the packed deck never reported ready').toHaveAttribute(
    'data-py-ready',
    'true',
    { timeout: 30_000 }
  );
  return frame;
}

async function expectSlide(frame: Frame, slideId: string, step = 0): Promise<void> {
  const app = frame.locator('[data-py-deck-app]');
  await expect(app).toHaveAttribute('data-slide-id', slideId);
  await expect(app).toHaveAttribute('data-slide-step', String(step));
  await expect.poll(() => frame.evaluate(() => window.location.hash)).toBe(`#/${slideId}/${step}`);
  // The @texuli/slides stage marks the slide on screen as active.
  await expect(
    frame.locator(`[data-tx-deck-slide="${slideId}"][data-tx-deck-active="true"]`)
  ).toBeVisible();
}

/** The entry script page.html loads; every other fetched script must be a re-export of it. */
async function entryScript(frame: Frame): Promise<string> {
  const src = await frame.locator('script[type="module"][src]').first().getAttribute('src');
  if (!src) throw new Error('page.html has no module entry script');
  return new URL(src, frame.url()).pathname;
}

/**
 * The artifact target puts every module in one chunk. Rolldown still writes a
 * tiny facade per dynamic import (`export{…}from"./<entry>.js"`): fetching
 * one runs no new code. A script with code of its own would be a split chunk.
 */
function facadeOf(entry: string): RegExp {
  const name = (entry.split('/').at(-1) ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^export\\s*\\{[^}]*\\}\\s*from\\s*"\\./${name}";?\\s*$`);
}

async function splitChunks(seen: Watch, entry: string): Promise<string[]> {
  const split: string[] = [];
  for (const script of seen.scripts) {
    const path = new URL(script.url).pathname;
    if (path === entry) continue;
    if (!facadeOf(entry).test((await script.body).trim())) split.push(path);
  }
  return split;
}

test.describe('deck exported as a Claude artifact', () => {
  test('renders the first slide, navigates by keyboard and hash, and loads one script chunk', async ({
    page,
  }) => {
    await page.context().addInitScript(FAKE_CLAUDE_INIT_SCRIPT);
    const seen = watch(page);
    const frame = await openDeck(page);

    // The first slide, with its title, and the slide counter.
    await expectSlide(frame, 'cover');
    await expect(
      frame
        .locator('[data-tx-deck-active="true"]')
        .getByRole('heading', { name: 'Protoyard: create anything' })
    ).toBeVisible();
    // The stage's slide counter (the slide list button).
    await expect(frame.locator('[data-tx-deck-tool="jump"]')).toHaveAttribute(
      'aria-label',
      /, 1 \/ \d+$/
    );

    // Keyboard: forward twice, back once (the deck takes focus from a click on its frame).
    const stage = frame.locator('.tx-deck-stage');
    await stage.focus();
    await stage.press('ArrowRight');
    await expectSlide(frame, 'promise');
    await stage.press('ArrowRight');
    await expectSlide(frame, 'problem');
    await stage.press('ArrowLeft');
    await expectSlide(frame, 'promise');
    await expect(frame.locator('[data-tx-deck-tool="jump"]')).toHaveAttribute(
      'aria-label',
      /, 2 \/ \d+$/
    );

    // A slide link inside the artifact frame, as a shared #/<id>/<step> would open it.
    await frame.evaluate(() => {
      window.location.hash = '#/quote/0';
    });
    await expectSlide(frame, 'quote');

    // One script chunk: the entry, plus at most facades that re-export from it.
    const entry = await entryScript(frame);
    expect(seen.scripts.map((script) => new URL(script.url).pathname)).toContain(entry);
    expect(await splitChunks(seen, entry)).toEqual([]);
    const packedScripts = (await harness.packFiles()).filter(
      (path) => path.endsWith('.js') && entry !== new URL(path, frame.url()).pathname
    );
    for (const path of packedScripts) {
      const body = await frame.evaluate(async (url) => (await fetch(url)).text(), path);
      if (WORKER_SCRIPT.test(path)) {
        // The embedded player's world worker (the player falls back to the
        // main thread without it) is a separate, self-contained script: it
        // never imports a sibling chunk, so it cannot reintroduce the split.
        expect(body, path).not.toMatch(/\bfrom\s*["']\.\.?\//);
        expect(body, path).not.toMatch(/\bimport\s*\(\s*["']\.\.?\//);
        continue;
      }
      // Every other script in the pack is a facade too, fetched or not.
      expect(body.trim(), path).toMatch(facadeOf(entry));
    }

    expect(seen.failed).toEqual([]);
    expect(seen.errors).toEqual([]);
  });

  test('opens straight on a deep slide link', async ({ page }) => {
    await page.context().addInitScript(FAKE_CLAUDE_INIT_SCRIPT);
    const seen = watch(page);
    const frame = await openDeck(page, { hash: '#/problem/0' });
    await expectSlide(frame, 'problem');
    expect(seen.errors).toEqual([]);
  });

  test('degrades safely without window.claude, the clipboard or IndexedDB', async ({ page }) => {
    // No Claude host API, no async clipboard and a refusing execCommand: the
    // deck still runs, and copying a slide reference says it failed.
    await page.context().addInitScript(FAKE_CLAUDE_INIT_SCRIPT);
    await page.context().addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => undefined,
      });
      Object.defineProperty(Document.prototype, 'execCommand', {
        configurable: true,
        value: () => false,
      });
    });
    const seen = watch(page);
    const frame = await openDeck(page, { noClaude: true, blockStorage: true });

    expect(await frame.evaluate(() => 'claude' in window)).toBe(false);
    await expectSlide(frame, 'cover');
    await expect(
      frame.getByRole('status').filter({ hasText: "Changes won't be saved." })
    ).toBeVisible();

    await frame.locator('.tx-deck-stage').focus();
    await frame.locator('.tx-deck-stage').press('ArrowRight');
    await expectSlide(frame, 'promise');

    // On a phone the share tools sit in the stage's More menu.
    const copy = frame.locator('[data-tx-deck-tool="copy-link"]');
    const more = frame.locator('.tx-deck-chrome-more summary');
    await expect.poll(async () => (await copy.isVisible()) || (await more.isVisible())).toBe(true);
    if (!(await copy.isVisible())) await more.click();
    await copy.click();
    await expect(frame.locator('.tx-deck-chrome-toast')).toHaveText(/Could not copy the link/);
    // Clicking a tool never advances the deck.
    await expectSlide(frame, 'promise');

    // A pack built without --comments has no review UI to fall back from.
    await expect(frame.locator('[data-py-review-toolbar], [data-py-review-root]')).toHaveCount(0);

    expect(seen.failed).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
});
