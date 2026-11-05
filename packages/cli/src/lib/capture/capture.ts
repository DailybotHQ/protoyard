import { type CaptureOptions, screenshot, withReadyPage } from './page.ts';
import type { CaptureUnavailable } from './playwright.ts';
import { launchChromium } from './playwright.ts';

/** One {@link capture}: a URL and how to open it. */
export interface CaptureRequest extends Partial<CaptureOptions> {
  /** A built prototype's URL, for example from `serveStatic` in `protoyard/static-server`. */
  url: string;
}

export type CaptureResult = { ok: true; png: Buffer } | CaptureUnavailable;

/**
 * A deterministic PNG of a running prototype, the same capture `protoyard
 * quick` screenshots, thumbnails and the visual sweep use: a fresh browser
 * context, scale 1, en-US and UTC, reduced motion, and a shot only after
 * `html[data-py-ready="true"]`, fonts, network idle and a quiet DOM.
 * Defaults: a 1280×800 desktop viewport in light mode. Playwright is optional:
 * without it (or without its Chromium) the result says why, and nothing throws.
 * Several shots share one browser through `withReadyPage` and `launchChromium`.
 */
export async function capture(request: CaptureRequest): Promise<CaptureResult> {
  const launch = await launchChromium();
  if (!launch.ok) return launch;
  try {
    const options: CaptureOptions = {
      viewport: request.viewport ?? { width: 1280, height: 800 },
      colorScheme: request.colorScheme ?? 'light',
      ...(request.mobile ? { mobile: true } : {}),
      ...(request.allowOrigin !== undefined ? { allowOrigin: request.allowOrigin } : {}),
    };
    const png = await withReadyPage(launch.browser, request.url, options, screenshot);
    return { ok: true, png };
  } finally {
    await launch.browser.close();
  }
}
