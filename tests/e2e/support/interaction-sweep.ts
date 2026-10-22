/**
 * Dead-control interaction sweep helpers for Playwright.
 *
 * Finds visible controls (buttons, links, role=button, inputs that look
 * actionable), activates them, and records whether route, DOM text, focus or
 * a data attribute changed. Display-only blocks (no control roles) are skipped.
 *
 * Pure classification helpers are unit-tested; page helpers run in the browser.
 */
import type { Locator, Page } from '@playwright/test';

export type InteractionKind = 'click' | 'keyboard';

export type InteractionOutcome =
  | 'changed'
  | 'unchanged'
  | 'skipped-display'
  | 'skipped-hidden'
  | 'skipped-disabled'
  | 'error';

export interface InteractionFinding {
  /** Stable selector or name used to find the control. */
  name: string;
  kind: InteractionKind;
  outcome: InteractionOutcome;
  detail?: string;
}

export interface InteractionSweepReport {
  findings: InteractionFinding[];
  /** Controls that should have changed but did not. */
  dead: InteractionFinding[];
  /** Controls that produced an observable change. */
  live: InteractionFinding[];
}

export interface ControlProbe {
  name: string;
  /** CSS selector scoped under `root`. */
  selector: string;
  /** When true, an unchanged outcome is a failure (expected live control). */
  expectLive?: boolean;
  /** When true, an unchanged outcome is success (deliberately inert). */
  expectDead?: boolean;
  kind?: InteractionKind;
}

/** Snapshot of page state used to detect an observable change. */
export interface PageSnapshot {
  url: string;
  title: string;
  bodyText: string;
  focusName: string;
  markers: string;
}

export function takeSnapshot(page: Page): Promise<PageSnapshot> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const markers = [
      ...document.querySelectorAll(
        '[data-slide-id], [data-py-deck-app], [aria-pressed], [data-state], [data-open], [aria-expanded]'
      ),
    ]
      .slice(0, 40)
      .map((el) => {
        const parts = [
          el.getAttribute('data-slide-id'),
          el.getAttribute('data-slide-step'),
          el.getAttribute('aria-pressed'),
          el.getAttribute('data-state'),
          el.getAttribute('aria-expanded'),
          el.getAttribute('data-open'),
        ].filter(Boolean);
        return parts.join(':');
      })
      .join('|');
    return {
      url: location.href,
      title: document.title,
      bodyText: (document.body?.innerText ?? '').slice(0, 4000),
      focusName: active
        ? `${active.tagName}:${active.getAttribute('aria-label') ?? active.id ?? active.className}`
        : '',
      markers,
    };
  });
}

export function snapshotChanged(
  before: PageSnapshot,
  after: PageSnapshot,
  options: { ignoreFocus?: boolean } = {}
): boolean {
  if (before.url !== after.url) return true;
  if (before.title !== after.title) return true;
  if (before.bodyText !== after.bodyText) return true;
  if (before.markers !== after.markers) return true;
  // Focusing a button is not a product effect — ignore for dead-control checks.
  if (!options.ignoreFocus && before.focusName !== after.focusName) return true;
  return false;
}

/**
 * Classify a control after activation. `changed` means the sweep observed an
 * effect; `unchanged` is a dead control when `expectLive` was set.
 */
export function classifyActivation(input: {
  name: string;
  kind: InteractionKind;
  changed: boolean;
  expectLive?: boolean;
  expectDead?: boolean;
  error?: string;
}): InteractionFinding {
  if (input.error) {
    return { name: input.name, kind: input.kind, outcome: 'error', detail: input.error };
  }
  if (input.expectDead) {
    if (input.changed) {
      return {
        name: input.name,
        kind: input.kind,
        outcome: 'changed',
        detail: 'inert control produced a change',
      };
    }
    return {
      name: input.name,
      kind: input.kind,
      outcome: 'unchanged',
      detail: 'inert as expected',
    };
  }
  if (input.changed) {
    return { name: input.name, kind: input.kind, outcome: 'changed' };
  }
  return {
    name: input.name,
    kind: input.kind,
    outcome: 'unchanged',
    detail: input.expectLive ? 'expected a visible effect' : 'no observable change',
  };
}

export function summarizeFindings(findings: readonly InteractionFinding[]): InteractionSweepReport {
  const dead = findings.filter(
    (f) => f.outcome === 'unchanged' && f.detail === 'expected a visible effect'
  );
  const live = findings.filter((f) => f.outcome === 'changed');
  return { findings: [...findings], dead, live };
}

/** Default selectors for actionable controls under a root. */
export const DEFAULT_CONTROL_SELECTORS = [
  'button:not([disabled]):not([aria-hidden="true"])',
  'a[href]:not([aria-hidden="true"])',
  '[role="button"]:not([aria-disabled="true"])',
  'input[type="checkbox"]:not([disabled])',
  'input[type="radio"]:not([disabled])',
  'summary',
] as const;

/**
 * Activate one control and return a finding. Does not fail the test — callers
 * assert on the report.
 */
export async function probeControl(
  page: Page,
  probe: ControlProbe,
  options: { root?: string } = {}
): Promise<InteractionFinding> {
  const kind = probe.kind ?? 'click';
  const root = options.root ? page.locator(options.root) : page.locator('body');
  const control = root.locator(probe.selector).first();
  try {
    if ((await control.count()) === 0) {
      return {
        name: probe.name,
        kind,
        outcome: 'skipped-hidden',
        detail: 'not found',
      };
    }
    if (!(await control.isVisible())) {
      return { name: probe.name, kind, outcome: 'skipped-hidden' };
    }
    if (await control.isDisabled().catch(() => false)) {
      return { name: probe.name, kind, outcome: 'skipped-disabled' };
    }
    const before = await takeSnapshot(page);
    if (kind === 'keyboard') {
      await control.focus();
      await page.keyboard.press('Enter');
    } else {
      await control.click({ timeout: 5_000 });
    }
    // Allow microtasks / transitions without wall-clock sleeps beyond a short poll.
    await page.waitForTimeout(50);
    const after = await takeSnapshot(page);
    const changed = snapshotChanged(before, after, {
      // Inert controls still receive focus on click; that is not a product effect.
      ignoreFocus: probe.expectDead === true,
    });
    return classifyActivation({
      name: probe.name,
      kind,
      changed,
      expectLive: probe.expectLive,
      expectDead: probe.expectDead,
    });
  } catch (error) {
    return {
      name: probe.name,
      kind,
      outcome: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run a list of probes and return a report. Optionally also activate every
 * matching default control under `root` as expectLive discoveries.
 */
export async function runInteractionSweep(
  page: Page,
  options: {
    root?: string;
    probes?: ControlProbe[];
    discover?: boolean;
    maxDiscover?: number;
  } = {}
): Promise<InteractionSweepReport> {
  const findings: InteractionFinding[] = [];
  for (const probe of options.probes ?? []) {
    findings.push(await probeControl(page, probe, { root: options.root }));
  }
  if (options.discover) {
    const root = options.root ? page.locator(options.root) : page.locator('body');
    const max = options.maxDiscover ?? 12;
    let count = 0;
    for (const selector of DEFAULT_CONTROL_SELECTORS) {
      const matches = root.locator(selector);
      const n = Math.min(await matches.count(), max - count);
      for (let i = 0; i < n; i += 1) {
        const el = matches.nth(i);
        const name =
          (await el.getAttribute('aria-label')) ||
          (await el.getAttribute('data-testid')) ||
          (await el.textContent()) ||
          `${selector}[${i}]`;
        findings.push(
          await probeControl(
            page,
            {
              name: name.trim().slice(0, 80) || selector,
              selector: `${selector} >> nth=${i}`,
              expectLive: true,
            },
            { root: options.root }
          )
        );
        count += 1;
        if (count >= max) break;
      }
      if (count >= max) break;
    }
  }
  return summarizeFindings(findings);
}

/** Assert helpers for specs. */
export function assertNoUnexpectedDead(report: InteractionSweepReport): void {
  if (report.dead.length === 0) return;
  const detail = report.dead.map((f) => `${f.name}: ${f.detail ?? f.outcome}`).join('\n');
  throw new Error(`Unexpected dead controls:\n${detail}`);
}

export function assertCaughtInert(report: InteractionSweepReport, name: string): void {
  const hit = report.findings.find((f) => f.name === name && f.expectDead !== false);
  const match = report.findings.find(
    (f) => f.name === name && (f.outcome === 'unchanged' || f.detail === 'inert as expected')
  );
  if (!match) {
    throw new Error(
      `Expected inert control "${name}" to stay unchanged; findings=${JSON.stringify(report.findings)}`
    );
  }
  void hit;
}

/** Locator convenience for a known control. */
export function controlByRole(
  page: Page,
  role: Parameters<Page['getByRole']>[0],
  name: string | RegExp
): Locator {
  return page.getByRole(role, { name });
}
