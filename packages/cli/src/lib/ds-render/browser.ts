/**
 * The Playwright side of `check ds --render`: one Chromium for the run, one
 * fresh context per visit (`withReadyPage` of `../capture`, the same
 * deterministic capture `quick` shots and the visual sweep use), the host
 * script injected, then Texuli's `runLockedRenderChecks` with the mapping
 * the host computed on the live page. Fetches outside the local server are
 * aborted. Playwright and `@axe-core/playwright` are loaded at run time; a
 * missing package or browser is a typed `unavailable` result, never a crash.
 */
import type { Browser, Page } from '@playwright/test';
import type { DsAxeRunner, DsCheckPage, DsCheckRun } from '@texuli/tools/ds-check';
import { type CaptureUnavailable, launchChromium, withReadyPage } from '../capture/index.ts';
import { DS_RENDER_HOST_GLOBAL, dsRenderHostScript } from './host-bundle.ts';
import {
  DS_RENDER_MIN_VISUALIZATION_PX,
  type DsRenderPageInfo,
  type DsRenderVisit,
  type LockedReportLike,
} from './index.ts';

/** A compiled run of the design system (Texuli's `DsCheckRun`), opaque here. */
export type CompiledRun = { variant: string | null; compiled?: unknown };

export interface DsRenderVisitRequest {
  /** The served prototype's base URL (`http://127.0.0.1:<port>/`). */
  baseUrl: string;
  visit: DsRenderVisit;
  runs: readonly CompiledRun[];
  /** No `allow` (an unlocked document): only `unmapped` controls are reported. */
  allowManifest: { allow?: Record<string, true> };
}

export interface DsRenderVisitResult {
  info: DsRenderPageInfo;
  locked: LockedReportLike;
}

/** What `./run.ts` needs from a browser; tests pass a fake. */
export interface DsRenderDriver {
  visit(request: DsRenderVisitRequest): Promise<DsRenderVisitResult>;
  close(): Promise<void>;
}

export type DsRenderDriverLaunch = { ok: true; driver: DsRenderDriver } | CaptureUnavailable;

/** The link to one visit: DevTools hidden, the mode set, then the hash route. */
export function visitUrl(baseUrl: string, visit: DsRenderVisit): string {
  const query = new URLSearchParams({ devtools: '0', mode: visit.mode });
  return `${baseUrl}?${query}#${visit.route.path}`;
}

/** The element the host is installed on: the prototype's mount point. */
export const DS_RENDER_SCOPE = '#app';

/**
 * Launch Chromium and load Texuli's checks and axe (from the workspace
 * `root`, then the CLI's own dependencies). Returns `unavailable` with the
 * reason when Playwright, its Chromium or `@axe-core/playwright` is missing.
 */
export async function launchDsRenderDriver(root: string): Promise<DsRenderDriverLaunch> {
  const tools = await import('@texuli/tools/ds-check');
  let axe: DsAxeRunner;
  try {
    axe = await tools.playwrightAxeRunner(root);
  } catch (error) {
    return {
      ok: false,
      reason: 'playwright-unavailable',
      detail: (error as Error).message.split('\n')[0] ?? String(error),
    };
  }
  const launch = await launchChromium();
  if (!launch.ok) return launch;
  const browser: Browser = launch.browser;
  const script = await dsRenderHostScript();
  const driver: DsRenderDriver = {
    async visit(request) {
      const { visit } = request;
      const url = visitUrl(request.baseUrl, visit);
      const origin = new URL(request.baseUrl).origin;
      return withReadyPage(
        browser,
        url,
        {
          viewport: { width: visit.viewport.width, height: visit.viewport.height },
          colorScheme: visit.mode,
          ...(visit.viewport.mobile ? { mobile: true } : {}),
          allowOrigin: origin,
        },
        async (page: Page) => {
          await page.addScriptTag({ content: script });
          const info = (await page.evaluate(
            ([name, scope, px]) =>
              (
                globalThis as unknown as Record<
                  string,
                  { install(scope: string, px: number): unknown }
                >
              )[name as string]?.install(scope as string, px as number),
            [DS_RENDER_HOST_GLOBAL, DS_RENDER_SCOPE, DS_RENDER_MIN_VISUALIZATION_PX] as const
          )) as DsRenderPageInfo;
          const checkPage = page as unknown as DsCheckPage;
          const mapping = await tools.mapLockedRenderPage(checkPage, request.allowManifest);
          const locked = await tools.runLockedRenderChecks(
            checkPage,
            request.runs as readonly DsCheckRun[],
            mapping,
            { modes: [visit.mode], axe }
          );
          return { info, locked: locked as unknown as LockedReportLike };
        }
      );
    },
    close: () => browser.close(),
  };
  return { ok: true, driver };
}
