import type { Browser, BrowserType } from '@playwright/test';

/**
 * Playwright is optional for the CLI: it is a development dependency of this
 * repository, not of `@protoyard/cli`. Capture code loads it here, at run
 * time, and gets a typed `unavailable` result instead of a crash when the
 * module or its Chromium build is missing, so callers can record a skip
 * (`playwright-unavailable`) rather than fail.
 */

/** Module names tried in order; both export the same `chromium`. */
export const PLAYWRIGHT_MODULES = ['@playwright/test', 'playwright'] as const;

export type CaptureUnavailableReason = 'playwright-unavailable' | 'browser-unavailable';

export interface CaptureUnavailable {
  ok: false;
  reason: CaptureUnavailableReason;
  /** One line for humans and the JSON envelope. */
  detail: string;
}

export type PlaywrightLoad = { ok: true; chromium: BrowserType } | CaptureUnavailable;
export type ChromiumLaunch = { ok: true; browser: Browser } | CaptureUnavailable;

export interface LoadPlaywrightOptions {
  /** Injectable for tests; defaults to a dynamic `import()`. */
  importModule?: (name: string) => Promise<unknown>;
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return (text.split('\n').find((line) => line.trim() !== '') ?? text).trim().slice(0, 300);
}

function isMissingModule(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}

/** Loads Playwright's `chromium`, or reports `playwright-unavailable`. */
export async function loadPlaywright(options: LoadPlaywrightOptions = {}): Promise<PlaywrightLoad> {
  const importModule = options.importModule ?? ((name: string) => import(name));
  for (const name of PLAYWRIGHT_MODULES) {
    let loaded: unknown;
    try {
      loaded = await importModule(name);
    } catch (error) {
      if (isMissingModule(error)) continue;
      return {
        ok: false,
        reason: 'playwright-unavailable',
        detail: `${name}: ${firstLine(error)}`,
      };
    }
    const chromium = (loaded as { chromium?: BrowserType } | null)?.chromium;
    if (chromium && typeof chromium.launch === 'function') return { ok: true, chromium };
  }
  return {
    ok: false,
    reason: 'playwright-unavailable',
    detail: `Playwright is not installed (tried ${PLAYWRIGHT_MODULES.join(', ')}).`,
  };
}

/**
 * Launches headless Chromium. A missing module is `playwright-unavailable`;
 * a module without its browser build (`playwright install chromium` never
 * ran) or a launch failure is `browser-unavailable`.
 */
export async function launchChromium(options: LoadPlaywrightOptions = {}): Promise<ChromiumLaunch> {
  const loaded = await loadPlaywright(options);
  if (!loaded.ok) return loaded;
  try {
    return { ok: true, browser: await loaded.chromium.launch() };
  } catch (error) {
    return { ok: false, reason: 'browser-unavailable', detail: firstLine(error) };
  }
}
