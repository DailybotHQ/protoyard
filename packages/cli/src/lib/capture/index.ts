/**
 * Deterministic browser capture with optional Playwright (thumbnails, visual
 * sweep, quick screenshots). Public as `protoyard/capture` and
 * `@protoyard/cli/capture`.
 */
export { type CaptureRequest, type CaptureResult, capture } from './capture.ts';
export {
  type CaptureOptions,
  captureMayFetch,
  QUIET_DOM,
  screenshot,
  withReadyPage,
} from './page.ts';
export {
  type CaptureUnavailable,
  type CaptureUnavailableReason,
  type ChromiumLaunch,
  type LoadPlaywrightOptions,
  launchChromium,
  loadPlaywright,
  PLAYWRIGHT_MODULES,
  type PlaywrightLoad,
} from './playwright.ts';
export { changedPixels, type DecodedImage, decodePng, optimizePng } from './png.ts';
