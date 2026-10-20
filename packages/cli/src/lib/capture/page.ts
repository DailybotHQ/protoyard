// Type-only: erased at runtime, so the CLI never loads Playwright through this file.
import type { Browser, Page } from '@playwright/test';

/**
 * Deterministic capture shared by the thumbnail and visual-sweep scripts and
 * `protoyard quick` screenshots: a fresh browser context per page (no
 * IndexedDB carries over), a fixed scale, locale and time zone, reduced
 * motion, and a capture only after the runtime marks
 * `html[data-py-ready="true"]`, fonts are loaded, the network is idle and the
 * DOM has been quiet for 400 ms (liveQuery results land a few ticks after
 * mount).
 */

export interface CaptureOptions {
  viewport: { width: number; height: number };
  colorScheme: 'light' | 'dark';
  /** Phone-like context: touch and the mobile viewport meta tag. */
  mobile?: boolean;
}

// A string, because tsx rewrites named functions with a helper the page lacks.
export const QUIET_DOM = `new Promise((done) => {
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(stop, 400); });
  const stop = () => { observer.disconnect(); done(); };
  timer = setTimeout(stop, 400);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
})`;

/** Opens `url`, waits until the prototype is ready and quiet, runs `use`, then closes the context. */
export async function withReadyPage<T>(
  browser: Browser,
  url: string,
  options: CaptureOptions,
  use: (page: Page) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: options.colorScheme,
    locale: 'en-US',
    timezoneId: 'UTC',
    ...(options.mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.pyReady !== undefined, null, {
      timeout: 30_000,
    });
    const state = await page.evaluate(() => document.documentElement.dataset.pyReady);
    if (state !== 'true') throw new Error(`prototype failed to boot (data-py-ready="${state}")`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.evaluate(QUIET_DOM);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    return await use(page);
  } finally {
    await context.close();
  }
}

/** A full-viewport PNG screenshot with animations and the caret frozen. */
export function screenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
}
