import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

/**
 * Objective app-ready wait for prototype E2E.
 *
 * `mountPrototype` sets `html[data-protoyard-ready="1"]` (and keeps the older
 * `data-py-ready="true"`) once the runtime opened, the first world exists, and
 * the first screen rendered. Prefer this helper over ad-hoc selector polls.
 */

export const PROTOTYPE_READY_TIMEOUT_MS = 15_000;

export type ReadyRoot = Page | Locator | FrameLocator;

export interface WaitForPrototypeReadyOptions {
  /** Prototype slug — included in the timeout error so failures name the target. */
  slug: string;
  timeoutMs?: number;
  /**
   * Scope for the `<html>` node (default: the page). Pass a frame locator when
   * the prototype is embedded (showcase iframe).
   */
  root?: ReadyRoot;
}

function htmlOf(root: ReadyRoot): Locator {
  // Page, Locator and FrameLocator all expose `.locator`.
  return root.locator('html');
}

/**
 * Waits until the prototype signals ready. Throws a message that names the
 * slug when the attribute does not appear in time.
 */
export async function waitForPrototypeReady(
  page: Page,
  options: WaitForPrototypeReadyOptions
): Promise<void> {
  const timeout = options.timeoutMs ?? PROTOTYPE_READY_TIMEOUT_MS;
  const root = options.root ?? page;
  const html = htmlOf(root);
  try {
    await expect(html).toHaveAttribute('data-protoyard-ready', '1', { timeout });
  } catch (cause) {
    const pyReady = await html.getAttribute('data-py-ready').catch(() => null);
    const message =
      `Prototype "${options.slug}" did not become ready ` +
      `(expected html[data-protoyard-ready="1"]) within ${timeout}ms` +
      (pyReady != null ? ` (data-py-ready="${pyReady}")` : '') +
      '. Ensure the static build finished mountPrototype (runtime open, first world, first screen).';
    throw new Error(message, { cause });
  }
}
