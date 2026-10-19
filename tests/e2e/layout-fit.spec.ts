import { expect, type Page, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Generic layout guard over every E2E prototype target, at a large desktop
 * window (1920×1080, Desktop Chrome project) and a phone (390×844, mobile
 * project). It opens each prototype's main route in its densest scenario and
 * checks what users notice first when the height chain breaks:
 *
 *  - `viewport` apps (chat, mobile shells, framed shells) bind their height to
 *    the window: the document never scrolls, every primary input
 *    (`[data-py-composer]` or a chat `textarea`) is fully on screen, and the
 *    main scroll region (the largest overflowing scroller) really scrolls;
 *  - `document` apps (AppShell dashboards that scroll the page by design):
 *    when the page overflows, the document itself scrolls, and primary inputs
 *    are reachable by scrolling.
 *
 * Specs that drive inputs with `fill()` miss this class of bug: Playwright
 * scrolls `overflow: hidden` ancestors programmatically, so a composer cut off
 * below the fold still "works" in a test. These checks measure rects instead.
 *
 * Targets without an entry below get the generic `document` check on their
 * default scenario and home route.
 */

type Layout = 'viewport' | 'document';

interface FitTarget {
  /** Densest cheap scenario (omit for the manifest default). */
  scenario?: string;
  /** Route hash, e.g. `#/c/conv_0005`. */
  hash?: string;
  layout: Layout;
  /** A selector that exists once the screen's data rendered. */
  ready?: string;
  /** The main region must overflow and scroll at this size (dense data). */
  mustScroll?: { desktop: boolean; phone: boolean };
}

const FIT_TARGETS: Record<string, FitTarget> = {
  // conv_0005 is the 600-message thread in `long-thread`.
  'ai-chat-demo': {
    scenario: 'long-thread',
    hash: '#/c/conv_0005',
    layout: 'viewport',
    ready: '[data-py-composer]',
    mustScroll: { desktop: true, phone: true },
  },
  // busy-day's first channel holds four messages: they fit a full-width phone log, as on
  // desktop (the old fixed 240 px sidebar squeezed the log until it overflowed).
  'relay-chat-demo': {
    scenario: 'busy-day',
    layout: 'viewport',
    ready: '[data-message-id]',
    mustScroll: { desktop: false, phone: false },
  },
  'support-widget-demo': { scenario: 'returning-customer', layout: 'viewport' },
  'mobile-banking-demo': {
    scenario: 'active-customer',
    hash: '#/',
    layout: 'viewport',
    ready: '[data-py-bottom-nav]',
    mustScroll: { desktop: true, phone: true },
  },
  'nova-assistant-demo': { scenario: 'long-history', hash: '#/', layout: 'viewport' },
  'helpdesk-demo': { scenario: 'massive', hash: '#/tickets', layout: 'document' },
  'crm-demo': { scenario: 'enterprise-scale', hash: '#/', layout: 'document' },
  'lattice-saas-demo': { scenario: 'multi-workspace-admin', hash: '#/app', layout: 'document' },
  'ui-kit': { hash: '#/', layout: 'document' },
  // The analytics flagship at its densest (rollups + a 5 % sample) and the template it came from.
  'pebblestat-analytics-demo': {
    scenario: 'enterprise-scale',
    hash: '#/',
    layout: 'document',
    ready: 'figure[data-py-chart]',
  },
  analytics: {
    scenario: 'massive',
    hash: '#/',
    layout: 'document',
    ready: 'figure[data-py-chart]',
  },
  // The busiest booking world on the calendar screen (week view on desktop, agenda on phones).
  'booking-calendar': { scenario: 'busy-week', hash: '#/', layout: 'document' },
  // The busiest front desk: a long day list and stat cards scroll as a document.
  clinic: {
    scenario: 'busy-clinic',
    hash: '#/',
    layout: 'document',
    ready: '[data-front-desk-list]',
  },
  // The windowed feed bound to the window: the composer stays on screen, the feed list scrolls.
  'social-feed': {
    scenario: 'massive',
    hash: '#/',
    layout: 'viewport',
    ready: '[data-py-composer]',
    mustScroll: { desktop: true, phone: true },
  },
  // The project-management flagship at its densest: 10,004 tasks in the virtualized grid.
  'keel-projects-demo': {
    scenario: 'massive',
    hash: '#/tasks',
    layout: 'document',
    ready: '[data-grid]',
  },
};

const DESKTOP = { width: 1920, height: 1080 } as const;
const PHONE = { width: 390, height: 844 } as const;

async function openTarget(page: Page, slug: string, target: FitTarget) {
  const query = target.scenario ? `?scenario=${target.scenario}` : '';
  await page.goto(`${prototypeUrl(slug)}${query}${target.hash ?? ''}`);
  await waitForPrototypeReady(page, { slug });
  if (target.ready) await page.locator(target.ready).first().waitFor({ timeout: 15_000 });
  // Let live queries settle and layout-dependent effects run.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  await page.waitForTimeout(300);
}

interface FitMetrics {
  docOverflow: number;
  innerHeight: number;
  innerWidth: number;
  inputs: { label: string; top: number; bottom: number; left: number; right: number }[];
  region: { label: string; overflow: number; scrolls: boolean } | null;
  documentScrolls: boolean;
}

/** Measures in the page; DevTools (its own host) is never part of the app layout. */
function measure(page: Page): Promise<FitMetrics> {
  return page.evaluate(() => {
    const outsideApp = (el: Element) => Boolean(el.closest('.py-devtools'));
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
        el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : ''
      }.${String((el as HTMLElement).className?.toString() ?? '').slice(0, 60)}`;

    const scrolling = document.scrollingElement ?? document.documentElement;
    const inputs = [...document.querySelectorAll('[data-py-composer], textarea')]
      .filter((el) => !outsideApp(el) && visible(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { label: label(el), top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });

    let best: { el: HTMLElement; area: number; overflow: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (outsideApp(el) || el.clientHeight < 120) continue;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow < 8) continue;
      const { overflowY } = getComputedStyle(el);
      if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
      const area = el.clientWidth * el.clientHeight;
      if (!best || area > best.area) best = { el, area, overflow };
    }
    let region: FitMetrics['region'] = null;
    if (best) {
      const before = best.el.scrollTop;
      best.el.scrollBy(0, 200);
      if (best.el.scrollTop === before) best.el.scrollBy(0, -200);
      const scrolls = best.el.scrollTop !== before;
      best.el.scrollTop = before;
      region = { label: label(best.el), overflow: best.overflow, scrolls };
    }

    const docOverflow = scrolling.scrollHeight - window.innerHeight;
    let documentScrolls = false;
    if (docOverflow > 1) {
      const before = scrolling.scrollTop;
      window.scrollBy(0, 200);
      documentScrolls = scrolling.scrollTop !== before;
      scrolling.scrollTop = before;
    }
    return {
      docOverflow,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      inputs,
      region,
      documentScrolls,
    };
  });
}

function assertFit(m: FitMetrics, target: FitTarget, size: 'desktop' | 'phone', where: string) {
  if (target.layout === 'viewport') {
    expect(
      m.docOverflow,
      `${where}: the document scrolls ${m.docOverflow}px past the viewport; app regions must scroll instead`
    ).toBeLessThanOrEqual(1);
    for (const input of m.inputs) {
      expect(
        input.top >= -1 &&
          input.bottom <= m.innerHeight + 1 &&
          input.left >= -1 &&
          input.right <= m.innerWidth + 1,
        `${where}: primary input ${input.label} is outside the viewport (top ${Math.round(input.top)}, bottom ${Math.round(input.bottom)}, viewport ${m.innerWidth}×${m.innerHeight})`
      ).toBe(true);
    }
  } else if (m.docOverflow > 1) {
    expect(m.documentScrolls, `${where}: the page overflows but the document does not scroll`).toBe(
      true
    );
  }
  if (m.region) {
    expect(
      m.region.scrolls,
      `${where}: main scroll region ${m.region.label} overflows by ${m.region.overflow}px but does not scroll`
    ).toBe(true);
  }
  if (target.mustScroll?.[size]) {
    expect(m.region, `${where}: expected an overflowing, scrollable main region`).not.toBeNull();
  }
}

function targetFor(slug: string): FitTarget {
  return FIT_TARGETS[slug] ?? { layout: 'document' };
}

test.describe('layout fit: every prototype target', () => {
  test.skip(PROTOTYPE_TARGETS.length === 0, 'set PROTOYARD_E2E_PROTOTYPES');

  test.describe('desktop 1920×1080', () => {
    test.use({ viewport: DESKTOP });
    for (const slug of PROTOTYPE_TARGETS) {
      test(`${slug}: fits the window, inputs on screen, main region scrolls`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'desktop window case');
        const target = targetFor(slug);
        await openTarget(page, slug, target);
        assertFit(await measure(page), target, 'desktop', `${slug} @1920×1080`);
      });
    }
  });

  test.describe('phone 390×844', () => {
    test.use({ viewport: PHONE });
    for (const slug of PROTOTYPE_TARGETS) {
      test(`${slug}: fits the phone, inputs on screen, main region scrolls`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile', 'mobile project only (touch + mobile UA)');
        const target = targetFor(slug);
        await openTarget(page, slug, target);
        assertFit(await measure(page), target, 'phone', `${slug} @390×844`);
      });
    }
  });
});
