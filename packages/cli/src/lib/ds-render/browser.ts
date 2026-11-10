/**
 * The Playwright side of `check ds --render`: one Chromium for the run, one
 * fresh context per visit (`withReadyPage` of `../capture`, the same
 * deterministic capture `quick` shots and the visual sweep use), Texuli's
 * prebuilt host IIFE (`./host-script.ts`) and Texuli's checks run in a CDP
 * isolated world (the prototype's
 * JavaScript cannot reach their globals or patch the DOM functions they
 * call; it can still change the shared DOM itself, and axe runs in the main
 * world), then Texuli's `runLockedRenderChecks` with the mapping the host
 * computed on the live page (Texuli's nesting rule: a nested catalog root
 * is allowed only as a declared part or composed id of its parent). Requests outside the local server are aborted,
 * WebSockets to another origin are closed and service workers are blocked. Playwright and `@axe-core/playwright` are loaded at run time; a
 * missing package or browser is a typed `unavailable` result, never a crash.
 */
import type { Browser, Page } from '@playwright/test';
import type { DsAxeRunner, DsCheckPage, DsCheckRun, DsMapReport } from '@texuli/tools/ds-check';
import { type CaptureUnavailable, launchChromium, withReadyPage } from '../capture/index.ts';
import { dsRenderHostScript, INSTALL_HOST } from './host-script.ts';
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
  allowManifest: { allow?: Record<string, unknown>; composed?: Record<string, string> };
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

/** Marks `undefined` inside an argument, which CDP's JSON would turn into null. */
const UNDEFINED = '\u0000protoyard:undefined';

/**
 * The function CDP calls for `fn(arg)`: `fn` is the CLI's or Texuli's own
 * function source (never page data, as with Playwright's `evaluate`); the
 * argument travels as JSON text with `undefined` kept.
 */
function callDeclaration(fn: string): string {
  return `async function (text, marker) {
  const arg = JSON.parse(text, (key, value) => (value === marker ? undefined : value));
  return await (${fn})(arg);
}`;
}

/** The parts of a CDP session this file uses (Playwright's `CDPSession`). */
interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
}

interface CdpEvaluation {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
}

export interface IsolatedWorld {
  /** A Texuli `DsCheckPage` whose `evaluate` and `waitForFunction` run in the world. */
  page: DsCheckPage;
  /** Evaluates a script (Texuli's host IIFE) in the world. */
  run(script: string): Promise<void>;
  evaluate(fn: string | ((arg: never) => unknown), arg: unknown): Promise<unknown>;
  detach(): Promise<void>;
}

function encodeArg(value: unknown): string {
  return JSON.stringify(value === undefined ? UNDEFINED : value, (_key, item) =>
    item === undefined ? UNDEFINED : item
  );
}

function failure(evaluation: CdpEvaluation): Error {
  const details = evaluation.exceptionDetails;
  return new Error(
    details?.exception?.description?.split('\n')[0] ?? details?.text ?? 'evaluation failed'
  );
}

/**
 * A Chromium isolated world (CDP `Page.createIsolatedWorld`) on the page's
 * main frame. Its JavaScript globals and DOM wrappers are its own; only the
 * DOM itself is shared with the prototype.
 */
export async function isolatedWorld(page: Page): Promise<IsolatedWorld> {
  const session = (await page.context().newCDPSession(page)) as unknown as CdpSession;
  const tree = (await session.send('Page.getFrameTree')) as {
    frameTree: { frame: { id: string } };
  };
  const created = (await session.send('Page.createIsolatedWorld', {
    frameId: tree.frameTree.frame.id,
    worldName: 'protoyard-ds-render',
  })) as { executionContextId: number };
  const contextId = created.executionContextId;
  const evaluate = async (fn: string | ((arg: never) => unknown), arg: unknown) => {
    const evaluation = (await session.send('Runtime.callFunctionOn', {
      functionDeclaration: callDeclaration(String(fn)),
      executionContextId: contextId,
      arguments: [{ value: encodeArg(arg) }, { value: UNDEFINED }],
      awaitPromise: true,
      returnByValue: true,
    })) as CdpEvaluation;
    if (evaluation.exceptionDetails) throw failure(evaluation);
    return evaluation.result?.value;
  };
  const checkPage = {
    goto: (url: string, options?: { timeout?: number }) => page.goto(url, options),
    emulateMedia: (options: Parameters<Page['emulateMedia']>[0]) => page.emulateMedia(options),
    evaluate: (fn: (arg: never) => unknown, arg: unknown) => evaluate(fn, arg),
    async waitForFunction(
      fn: (arg: never) => unknown,
      arg: unknown,
      options?: { timeout?: number }
    ) {
      const deadline = Date.now() + (options?.timeout ?? 30_000);
      for (;;) {
        const value = await evaluate(fn, arg);
        if (value) return value;
        if (Date.now() > deadline) throw new Error('Timed out waiting in the isolated world.');
        await new Promise((done) => setTimeout(done, 50));
      }
    },
  } as unknown as DsCheckPage;
  return {
    page: checkPage,
    async run(script) {
      const evaluation = (await session.send('Runtime.evaluate', {
        expression: script,
        contextId,
        returnByValue: true,
      })) as CdpEvaluation;
      if (evaluation.exceptionDetails) throw failure(evaluation);
    },
    evaluate,
    detach: () => session.detach().catch(() => undefined),
  };
}

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
  // Texuli's prebuilt host, read before a browser starts (a missing file is a typed error).
  const script = dsRenderHostScript();
  const launch = await launchChromium();
  if (!launch.ok) return launch;
  const browser: Browser = launch.browser;
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
          // The host and every Texuli check run in an isolated world: the
          // prototype's own JavaScript shares the DOM but not these globals or
          // DOM prototypes, so it cannot stub the checker or patch
          // getAttribute, querySelectorAll or getComputedStyle under it.
          const world = await isolatedWorld(page);
          try {
            await world.run(script);
            const info = (await world.evaluate(INSTALL_HOST, [
              DS_RENDER_SCOPE,
              DS_RENDER_MIN_VISUALIZATION_PX,
            ])) as DsRenderPageInfo;
            const checkPage = world.page;
            // Texuli's mapping in the same world: since 0.17.2 it hands the
            // host's map the allow set and the composed map.
            const mapping: DsMapReport = await tools.mapLockedRenderPage(
              checkPage,
              request.allowManifest
            );
            const locked = await tools.runLockedRenderChecks(
              checkPage,
              request.runs as readonly DsCheckRun[],
              mapping,
              // axe needs Playwright's page; it runs in the main world (see THEMES.md limits).
              { modes: [visit.mode], axe: () => axe(page as unknown as DsCheckPage) }
            );
            return { info, locked: locked as unknown as LockedReportLike };
          } finally {
            await world.detach();
          }
        }
      );
    },
    close: () => browser.close(),
  };
  return { ok: true, driver };
}
