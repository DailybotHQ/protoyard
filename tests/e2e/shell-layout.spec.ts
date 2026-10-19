import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * Layout under viewport presets, against the STATIC build of Lumen Bank
 * (manifest `preview.viewport: "iphone"`). The preset narrows #app; it must
 * not grow the document or push fixed descendants (the bottom nav) below
 * the fold: #app is a viewport-tall box and the app scrolls inside its own
 * scroll container (Lumen Bank: MobileAppShell's <main>; other apps: the
 * renderer's scroll root).
 */
const SLUG = 'mobile-banking-demo';
/** Lumen Bank suites skip unless it is a target; the Nova suites below have their own guard. */
const skipWithoutBanking = () =>
  test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

async function openApp(page: Page, hash = '') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active-customer${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-py-ready', 'true', { timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-py-viewport', 'iphone');
}

const viewportHeight = (page: Page) => page.evaluate(() => window.innerHeight);

/** Lumen Bank scrolls inside MobileAppShell's <main id="main">, never the document. */
const appScroller = (page: Page) => page.locator('[data-py-scroll-root] main#main');

test.describe('viewport preset layout (Lumen Bank)', () => {
  skipWithoutBanking();
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the document does not scroll and the bottom nav is fully visible', async ({ page }) => {
    await openApp(page);
    const nav = page.locator('[data-py-bottom-nav]');
    await expect(nav).toBeVisible();

    const doc = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    expect(doc.scrollHeight).toBeLessThanOrEqual(doc.clientHeight);

    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    const height = await viewportHeight(page);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height + 0.5);

    // The nav sits inside the narrowed column, not across the whole window.
    const column = await page.locator('#app').boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual((column?.x ?? 0) - 0.5);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (column?.x ?? 0) + (column?.width ?? 0) + 0.5
    );
  });

  test('the last Home section is reachable by scrolling the app, above the nav', async ({
    page,
  }) => {
    await openApp(page);
    const scrollRoot = appScroller(page);
    const overflow = await scrollRoot.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeGreaterThan(0);

    const last = page.getByRole('heading', { name: 'Spending, last 30 days' });
    await scrollRoot.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(last).toBeInViewport();

    const navTop = (await page.locator('[data-py-bottom-nav]').boundingBox())?.y ?? 0;
    const section = page.locator('section', { has: last });
    const sectionBox = await section.boundingBox();
    expect((sectionBox?.y ?? 0) + (sectionBox?.height ?? 0)).toBeLessThanOrEqual(navTop + 0.5);

    // The nav did not move while the app scrolled.
    const height = await viewportHeight(page);
    const navBox = await page.locator('[data-py-bottom-nav]').boundingBox();
    expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual(height + 0.5);
  });

  test('navigating resets the app scroll position', async ({ page }) => {
    await openApp(page);
    const scrollRoot = appScroller(page);
    await scrollRoot.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    expect(await scrollRoot.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.locator('[data-py-bottom-nav]').getByRole('link', { name: 'Activity' }).click();
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    expect(await scrollRoot.evaluate((el) => el.scrollTop)).toBe(0);
  });
});

/**
 * Shell matrix (ADR-016): every framed shell via `?shell=` on the same static
 * Lumen Bank build. Desktop runs at 1440×900, wide enough for every frame
 * (the panel shells need the 1280 px laptop device plus a gutter). On the
 * mobile project the window is narrower than any device, so no shell draws a
 * frame and the app is full-bleed, as on a real phone.
 */
type Box = { x: number; y: number; width: number; height: number };

const FRAMED_SHELLS: readonly {
  shell: string;
  frame: string;
  open?: (page: Page) => Promise<void>;
}[] = [
  { shell: 'phone', frame: '[data-py-frame="phone"]' },
  { shell: 'tablet', frame: '[data-py-frame="tablet"]' },
  { shell: 'desktop-window', frame: '[data-py-wallpaper]' },
  { shell: 'browser', frame: '[data-py-frame="browser"]' },
  {
    shell: 'widget-host',
    frame: '[data-py-frame="widget-host"]',
    // The widget starts closed behind its launcher, like a real support widget.
    open: async (page) => {
      await page.locator('[data-py-widget-launcher]').click();
      await expect(page.locator('[data-py-frame="widget-host"]')).toHaveAttribute(
        'data-py-widget-open',
        'true'
      );
    },
  },
  { shell: 'extension-popup', frame: '[data-py-frame="extension-popup"]' },
  { shell: 'side-panel', frame: '[data-py-frame="side-panel"]' },
];

const FRAME_MARKERS = '[data-py-frame], [data-py-wallpaper]';

async function openShell(page: Page, shell: string | null) {
  const query = shell ? `&shell=${shell}` : '';
  await page.goto(`${prototypeUrl(SLUG)}?scenario=active-customer${query}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} has a box`).not.toBeNull();
  return box as Box;
}

function expectInside(inner: Box, outer: Box, label: string) {
  const tol = 1;
  expect(inner.x, `${label}: left`).toBeGreaterThanOrEqual(outer.x - tol);
  expect(inner.y, `${label}: top`).toBeGreaterThanOrEqual(outer.y - tol);
  expect(inner.x + inner.width, `${label}: right`).toBeLessThanOrEqual(outer.x + outer.width + tol);
  expect(inner.y + inner.height, `${label}: bottom`).toBeLessThanOrEqual(
    outer.y + outer.height + tol
  );
}

/**
 * The app is actually painted, not just laid out: at the app heading, the top element
 * (with pointer events forced on for frame parts, so overlays count) must be inside the
 * screen, or a fully transparent frame part. A frame that covered the app with an opaque
 * surface passed every geometric check while showing a blank screen.
 */
async function expectAppPainted(page: Page, label: string) {
  const blocker = await page.evaluate(() => {
    const screenEl = document.querySelector('[data-py-shell-part="screen"]');
    const heading = screenEl?.querySelector('h1');
    if (!screenEl || !heading) return 'no app heading in the screen';
    const force = document.createElement('style');
    force.textContent =
      '[data-py-frame], [data-py-frame] *, [data-py-wallpaper] { pointer-events: auto !important; }';
    document.head.append(force);
    const r = heading.getBoundingClientRect();
    const stack = document.elementsFromPoint(
      r.left + Math.min(r.width / 2, 24),
      r.top + r.height / 2
    );
    force.remove();
    for (const el of stack) {
      if (screenEl.contains(el)) return null;
      const cs = getComputedStyle(el);
      const transparent =
        /^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor) && cs.backgroundImage === 'none';
      if (!transparent) {
        const marks = [...el.attributes]
          .filter((a) => a.name.startsWith('data-py'))
          .map((a) => a.name);
        return `${el.tagName.toLowerCase()} ${marks.join(' ')} (${cs.backgroundColor}) covers the app`;
      }
    }
    return 'the app heading is not painted';
  });
  expect(blocker, `${label}: app content visible`).toBeNull();
}

async function expectDocumentDoesNotScroll(page: Page) {
  const doc = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });
  expect(doc.scrollHeight, 'document height').toBeLessThanOrEqual(doc.clientHeight);
  expect(doc.scrollWidth, 'document width').toBeLessThanOrEqual(doc.clientWidth);
}

async function viewportBox(page: Page): Promise<Box> {
  return page.evaluate(() => ({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
}

/** Primary actions (Home quick actions) and the bottom nav, inside `bounds`. */
async function expectActionsInside(page: Page, bounds: Box, label: string) {
  await expect(page.locator('[data-py-bottom-nav]')).toBeVisible();
  expectInside(await boxOf(page, '[data-py-bottom-nav]'), bounds, `${label} bottom nav`);
  const transfer = page
    .getByRole('navigation', { name: 'Quick actions' })
    .getByRole('link', { name: 'Transfer' });
  await expect(transfer).toBeVisible();
  expectInside((await transfer.boundingBox()) as Box, bounds, `${label} primary action`);
}

test.describe('shell matrix: framed on desktop', () => {
  skipWithoutBanking();
  for (const { shell, frame, open } of FRAMED_SHELLS) {
    test(`${shell}: framed, actions and fixed children inside the screen, no document scroll, axe`, async ({
      page,
      isMobile,
    }, testInfo) => {
      test.skip(isMobile, 'frames need a window wider than the device');
      await page.setViewportSize({ width: 1440, height: 900 });
      // Settled state only: an opening panel mid-fade blends colors and skews contrast.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openShell(page, shell);
      await expect(page.locator('html')).toHaveAttribute('data-py-shell', shell);
      await expect(page.locator(frame).first()).toBeVisible();
      await open?.(page);

      const viewport = await viewportBox(page);
      const screen = await boxOf(page, '[data-py-shell-part="screen"]');
      expectInside(screen, viewport, `${shell} screen`);
      await expectActionsInside(page, screen, shell);
      await expectAppPainted(page, shell);

      // position: fixed descendants (the bottom nav, sheets…) stay in the screen box.
      const escaped = await page.evaluate(() => {
        const screenEl = document.querySelector('[data-py-shell-part="screen"]') as HTMLElement;
        const s = screenEl.getBoundingClientRect();
        const out: string[] = [];
        for (const el of screenEl.querySelectorAll<HTMLElement>('*')) {
          if (getComputedStyle(el).position !== 'fixed') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (
            r.left < s.left - 1 ||
            r.top < s.top - 1 ||
            r.right > s.right + 1 ||
            r.bottom > s.bottom + 1
          ) {
            out.push(
              `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.attributes]
                .filter((a) => a.name.startsWith('data-py'))
                .map((a) => `[${a.name}]`)
                .join('')}`
            );
          }
        }
        return out;
      });
      expect(escaped, `${shell}: fixed elements outside the screen`).toEqual([]);

      await expectDocumentDoesNotScroll(page);
      await expectAccessible(page, testInfo, { label: `shell-${shell}` });
    });
  }
});

test.describe('shell matrix: full-bleed on a phone', () => {
  skipWithoutBanking();
  for (const shell of [null, ...FRAMED_SHELLS.map((s) => s.shell)]) {
    test(`${shell ?? 'auto'}: no frame, actions inside the viewport, no document scroll`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, 'runs on the mobile project (Pixel 7)');
      await openShell(page, shell);
      await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);
      await expect(page.locator(FRAME_MARKERS)).toHaveCount(0);
      await expectActionsInside(page, await viewportBox(page), shell ?? 'auto');
      await expectDocumentDoesNotScroll(page);
    });
  }
});

/**
 * The rotate control decorates the device; it must never sit on app pixels.
 * It used to cover the lower right of the screen, where the last bottom-nav
 * tab (and bottom-sheet actions) live, so a tap there rotated the device.
 */
function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe('shell matrix: the rotate control stays off the screen', () => {
  skipWithoutBanking();
  for (const shell of ['phone', 'tablet'] as const) {
    test(`${shell}: rotate button outside the screen, in the viewport, last tab hit-testable`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'frames need a window wider than the device');
      await page.setViewportSize({ width: 1440, height: 900 });
      await openShell(page, shell);
      await expect(page.locator('html')).toHaveAttribute('data-py-shell', shell);

      for (const orientation of ['portrait', 'landscape'] as const) {
        const toggle = page.locator('[data-py-orientation-toggle]');
        await expect(page.locator(`[data-py-frame="${shell}"]`)).toHaveAttribute(
          'data-py-orientation',
          orientation
        );
        await expect(toggle).toBeVisible();
        const button = (await toggle.boundingBox()) as Box;
        const screen = await boxOf(page, '[data-py-shell-part="screen"]');
        expect(intersects(button, screen), `${shell} ${orientation}: button over the screen`).toBe(
          false
        );
        expectInside(button, await viewportBox(page), `${shell} ${orientation} rotate button`);

        // The home indicator is a frame control too: it stays inside the bottom safe inset.
        const home = (await page.getByRole('button', { name: 'Go home' }).boundingBox()) as Box;
        const safeBottom = await page
          .locator('[data-py-shell-part="screen"]')
          .evaluate((el) =>
            Number.parseFloat(getComputedStyle(el).getPropertyValue('--py-safe-bottom'))
          );
        const scale =
          screen.height /
          (await page
            .locator('[data-py-shell-part="screen"]')
            .evaluate((el) => (el as HTMLElement).offsetHeight));
        expect(
          home.y,
          `${shell} ${orientation}: home indicator above the safe inset`
        ).toBeGreaterThanOrEqual(screen.y + screen.height - safeBottom * scale - 1);

        // The lower right of the last bottom-nav tab belongs to the app.
        const hit = await page.evaluate(() => {
          const screenEl = document.querySelector('[data-py-shell-part="screen"]');
          const links = document.querySelectorAll(
            '[data-py-bottom-nav] a, [data-py-bottom-nav] button'
          );
          const last = links[links.length - 1];
          if (!screenEl || !last) return 'no bottom nav tab';
          const r = last.getBoundingClientRect();
          const top = document.elementFromPoint(r.right - 4, r.bottom - 4);
          return top && screenEl.contains(top) ? null : `${top?.tagName ?? 'nothing'} is on top`;
        });
        expect(hit, `${shell} ${orientation}: last tab`).toBeNull();

        if (orientation === 'portrait') await toggle.click();
      }
    });
  }
});

/**
 * The phone's glass: every layer of the screen (the app, the status bar, the home
 * indicator) is clipped to the device's corner radius, and a landscape phone gives the
 * app the whole width between its side insets. The status bar used to be a plain
 * rectangle above the bezel, so its square top corners stuck out past the rounded
 * bezel; in landscape the app kept a 448 px column and the status bar covered its header.
 */
test.describe('phone shell: rounded glass and landscape layout', () => {
  skipWithoutBanking();
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'frames need a window wider than the device');
  });

  async function openTransfer(page: Page) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active-customer&shell=phone#/transfer`);
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'phone');
    await expect(page.locator('[data-py-status-bar]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Send money' })).toBeVisible();
  }

  /**
   * What paints at a point just inside each corner of the device box, beyond the
   * rounded glass (and the bezel ring around it): only the stage may be there.
   */
  async function cornerPainters(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const device = document.querySelector('[data-py-shell-part="device"]') as HTMLElement;
      const stage = document.querySelector('[data-py-shell-part="stage"]') as HTMLElement;
      const force = document.createElement('style');
      force.textContent =
        '[data-py-shell-part], [data-py-shell-part] * { pointer-events: auto !important; }';
      document.head.append(force);
      const r = device.getBoundingClientRect();
      const d = 3;
      const corners: [string, number, number][] = [
        ['top-left', r.left + d, r.top + d],
        ['top-right', r.right - d, r.top + d],
        ['bottom-right', r.right - d, r.bottom - d],
        ['bottom-left', r.left + d, r.bottom - d],
      ];
      const out: string[] = [];
      for (const [name, x, y] of corners) {
        // Transparent wrappers (the frame overlay) may cover the corner; anything that
        // paints there, or any part of the screen, is a leak.
        for (const el of document.elementsFromPoint(x, y)) {
          if (el === stage) break;
          const cs = getComputedStyle(el);
          const transparent =
            /^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor) &&
            cs.backgroundImage === 'none' &&
            cs.borderTopWidth === '0px';
          if (transparent) continue;
          const marks = [...el.attributes]
            .filter((a) => a.name.startsWith('data-py'))
            .map((a) => a.name);
          out.push(
            `${name}: ${el.tagName.toLowerCase()} ${marks.join(' ')} (${cs.backgroundColor})`
          );
          break;
        }
      }
      force.remove();
      return out;
    });
  }

  test('portrait: the screen and the status bar are clipped to the device radius', async ({
    page,
  }) => {
    await openTransfer(page);
    const clip = await page.evaluate(() => {
      const radiusOf = (el: Element | null) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          overflow: cs.overflow,
          radii: [
            cs.borderTopLeftRadius,
            cs.borderTopRightRadius,
            cs.borderBottomRightRadius,
            cs.borderBottomLeftRadius,
          ],
        };
      };
      return {
        screen: radiusOf(document.querySelector('[data-py-shell-part="screen"]')),
        chrome: radiusOf(document.querySelector('[data-py-screen-clip]')),
        barInChrome: Boolean(document.querySelector('[data-py-screen-clip] [data-py-status-bar]')),
      };
    });
    const rounded = { overflow: 'hidden', radii: ['55px', '55px', '55px', '55px'] };
    expect(clip.screen, 'screen').toEqual(rounded);
    expect(clip.chrome, 'status bar and home indicator layer').toEqual(rounded);
    expect(clip.barInChrome).toBe(true);
    expect(await cornerPainters(page), 'paint past the rounded corners').toEqual([]);
  });

  test('landscape: the app fills the screen, keeps its header, and the document never scrolls', async ({
    page,
  }) => {
    await openTransfer(page);
    await page.locator('[data-py-orientation-toggle]').click();
    await expect(page.locator('[data-py-frame="phone"]')).toHaveAttribute(
      'data-py-orientation',
      'landscape'
    );
    expect(await cornerPainters(page), 'paint past the rounded corners').toEqual([]);

    const device = await boxOf(page, '[data-py-shell-part="device"]');
    const screen = await boxOf(page, '[data-py-shell-part="screen"]');
    expect(device.width, 'landscape device').toBeGreaterThan(device.height);
    expectInside(screen, device, 'screen');

    // The app is not a phone-width column: it spans the screen between the side insets.
    const app = await boxOf(page, '[data-py-scroll-root] > *');
    expect(app.width / device.width, 'app width / screen width').toBeGreaterThanOrEqual(0.85);
    expectInside(app, screen, 'app');

    // The header is below the status bar and really painted (not covered by it).
    const heading = page.getByRole('heading', { name: 'Send money' });
    await expect(heading).toBeVisible();
    const headingBox = (await heading.boundingBox()) as Box;
    expectInside(headingBox, screen, 'header');
    const bar = await boxOf(page, '[data-py-status-bar]');
    expect(headingBox.y, 'header below the status bar').toBeGreaterThanOrEqual(
      bar.y + bar.height - 1
    );
    const headingOnTop = await heading.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return top !== null && (el === top || el.contains(top));
    });
    expect(headingOnTop, 'header hit-testable').toBe(true);

    // The bottom nav spans the app and stays inside the screen.
    const nav = await boxOf(page, '[data-py-bottom-nav]');
    expectInside(nav, screen, 'bottom nav');
    expect(Math.abs(nav.width - app.width), 'nav spans the app width').toBeLessThanOrEqual(1);

    // Nothing (the demo badge included) covers a bottom-nav tab.
    const covered = await page.evaluate(() =>
      [...document.querySelectorAll('[data-py-bottom-nav] a')].flatMap((link) => {
        const r = link.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top && link.contains(top) ? [] : [link.textContent?.trim() ?? '?'];
      })
    );
    expect(covered, 'covered tabs').toEqual([]);

    // Only the app's own content area scrolls.
    await expectDocumentDoesNotScroll(page);
    const main = page.locator('[data-py-scroll-root] main#main');
    expect(await main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await main.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expectDocumentDoesNotScroll(page);
    expect((await boxOf(page, '[data-py-bottom-nav]')).y).toBeCloseTo(nav.y, 0);
  });
});

/**
 * Window-like frames fill the stage, and every frame has a full-screen toggle
 * (ADR-016). Nova Assistant ships in the `browser` shell: it used to render as a
 * fixed 1280×800 window centred in a 1920 px screen, with the demo badge over its
 * sidebar and the "Simulation only" footer over the last message.
 */
const NOVA = 'nova-assistant-demo';
const FRAME_PARTS =
  '[data-py-frame], [data-py-wallpaper], [data-py-frame-toggle][aria-pressed="false"]';

async function openNova(page: Page, query = '') {
  await page.goto(`${prototypeUrl(NOVA)}?scenario=active-workspace${query}`);
  await waitForPrototypeReady(page, { slug: NOVA });
  await expect(page.getByRole('log', { name: 'Conversation messages' })).toBeVisible();
}

/** Visible interactive elements the demo badge overlaps (none expected). */
async function badgeOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const badge = document.querySelector('[data-py-demo-badge]');
    if (!badge) return ['no demo badge'];
    const b = badge.getBoundingClientRect();
    const selector =
      'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      const r = el.getBoundingClientRect();
      // Skip links and other visually hidden controls (1 px clip) are not covered.
      if (r.width < 4 || r.height < 4 || getComputedStyle(el).visibility === 'hidden') continue;
      const cs = getComputedStyle(el);
      if (cs.opacity === '0') continue;
      // Visually hidden (sr-only skip links: clipped to nothing).
      if (cs.clipPath.startsWith('inset(50%') || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
      if (r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"`
        );
      }
    }
    return out;
  });
}

/** Nova's footer sits below the thread and the composer, never over them. */
async function expectFooterClear(page: Page) {
  const footer = await boxOf(page, 'main > footer');
  const log = (await page.getByRole('log', { name: 'Conversation messages' }).boundingBox()) as Box;
  const composer = (await page
    .getByRole('textbox', { name: 'Message the simulated assistant' })
    .boundingBox()) as Box;
  expect(log.y + log.height, 'thread ends above the footer').toBeLessThanOrEqual(footer.y + 0.5);
  expect(composer.y + composer.height, 'composer above the footer').toBeLessThanOrEqual(
    footer.y + 0.5
  );
  // The last rendered message is clipped by the thread, never painted under the footer.
  const lastBottom = await page.evaluate(() => {
    const log = document.querySelector('[role="log"]') as HTMLElement;
    const items = log.querySelectorAll('article');
    const last = items[items.length - 1];
    if (!last) return 0;
    return Math.min(last.getBoundingClientRect().bottom, log.getBoundingClientRect().bottom);
  });
  expect(lastBottom, 'last message above the footer').toBeLessThanOrEqual(footer.y + 0.5);
  const settings = page.getByRole('link', { name: 'Settings', exact: true }).first();
  if (await settings.isVisible()) {
    const box = (await settings.boundingBox()) as Box;
    const screenEl = page.locator('[data-py-shell-part="screen"]');
    const bounds = (await page.locator('html').getAttribute('data-py-shell'))
      ? ((await screenEl.boundingBox()) as Box)
      : await viewportBox(page);
    expectInside(box, bounds, 'sidebar Settings link');
    const onTop = await settings.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top !== null && (el === top || el.contains(top));
    });
    expect(onTop, 'Settings link hit-testable').toBe(true);
  }
}

test.describe('Nova browser frame: fluid size and full screen', () => {
  test.skip(!PROTOTYPE_TARGETS.includes(NOVA), `set PROTOYARD_E2E_PROTOTYPES to include ${NOVA}`);
  test.beforeEach(async ({ isMobile, page }) => {
    test.skip(isMobile, 'frames need a window wider than the device');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  // At 1440×900 the window's catalog height (800 px) is the minimum, so the box scales
  // down a little to fit the height; at 1920×1080 it grows on both axes.
  for (const { minShare, ...size } of [
    { width: 1920, height: 1080, minShare: 0.85 },
    { width: 1440, height: 900, minShare: 0.8 },
  ]) {
    test(`${size.width}×${size.height}: the browser window fills the stage; badge and footer stay clear`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(size);
      await openNova(page);
      await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'browser');
      const screen = await boxOf(page, '[data-py-shell-part="screen"]');
      expect(screen.width / size.width, 'screen width / viewport').toBeGreaterThanOrEqual(minShare);
      expectInside(screen, await viewportBox(page), 'screen');
      await expect(page.getByRole('button', { name: 'Show full screen' })).toBeVisible();
      const toggle = (await page
        .getByRole('button', { name: 'Show full screen' })
        .boundingBox()) as Box;
      expect(intersects(toggle, screen), 'toggle over the screen').toBe(false);
      expectInside(toggle, await viewportBox(page), 'toggle');
      expect(await badgeOverlaps(page), 'badge over controls').toEqual([]);
      const badge = await boxOf(page, '[data-py-demo-badge]');
      expect(intersects(badge, screen), 'badge over the screen').toBe(false);
      await expectFooterClear(page);
      await expectDocumentDoesNotScroll(page);
      await expectAccessible(page, testInfo, { label: `nova-framed-${size.width}` });
    });
  }

  test('full screen: the app fills the viewport without frame parts, Escape restores the frame', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openNova(page);
    await page.getByRole('button', { name: 'Show full screen' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);
    await expect(page.locator(FRAME_PARTS)).toHaveCount(0);
    const app = await boxOf(page, '[data-py-scroll-root] > *');
    const viewport = await viewportBox(page);
    expect(app.x).toBeLessThanOrEqual(0.5);
    expect(app.y).toBeLessThanOrEqual(0.5);
    expect(app.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(app.height).toBeGreaterThanOrEqual(viewport.height - 1);
    const exit = page.getByRole('button', { name: 'Show in frame' });
    await expect(exit).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => badgeOverlaps(page), { message: 'badge over controls' }).toEqual([]);
    await expectFooterClear(page);
    await expectDocumentDoesNotScroll(page);
    await expect(page.locator('[data-py-frame-hint]')).toHaveCount(0, { timeout: 6000 });
    await expectAccessible(page, testInfo, { label: 'nova-full-screen' });

    // The state persists per prototype: a reload stays full screen.
    await page.reload();
    await waitForPrototypeReady(page, { slug: NOVA });
    await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);

    await page.locator('body').press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'browser');
    await expect(page.locator('[data-py-frame="browser"]')).toBeVisible();
    await page.reload();
    await waitForPrototypeReady(page, { slug: NOVA });
    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'browser');
  });

  test('?frame=none opens frameless; the keyboard reaches "Show in frame" and the link param is dropped', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openNova(page, '&frame=none');
    await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);
    await expect(page.locator(FRAME_PARTS)).toHaveCount(0);
    // Invisible and click-through until it has keyboard focus, like a skip link.
    const exit = page.getByRole('button', { name: 'Show in frame' });
    await expect(exit).toHaveCSS('opacity', '0');
    await page.keyboard.press('Tab');
    await exit.focus();
    await expect(exit).toBeFocused();
    await expect(exit).toHaveCSS('opacity', '1');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'browser');
    expect(new URL(page.url()).searchParams.get('frame')).toBeNull();
  });

  test('widget sidebar: single column, the composer is wide and fully visible', async ({
    page,
  }) => {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await openNova(page);
      await page.getByRole('button', { name: 'Widget demo' }).click();
      const launcher = page.getByRole('button', { name: 'Open simulated assistant' });
      await expect(launcher).toBeVisible();
      await launcher.click();
      const panel = page.locator('[data-widget-panel]');
      await expect(panel).toHaveAttribute('data-widget-fullscreen', 'false');
      const prompt = panel.getByRole('textbox', { name: 'Message the simulated assistant' });
      await expect(prompt).toBeVisible();
      const box = (await prompt.boundingBox()) as Box;
      expect(box.width, `${size.width}: composer width`).toBeGreaterThanOrEqual(240);
      expectInside(box, (await panel.boundingBox()) as Box, `${size.width}: composer in panel`);
      expectInside(
        box,
        await boxOf(page, '[data-py-shell-part="screen"]'),
        `${size.width}: composer on screen`
      );
      // The whole panel body fits: the disclaimer under the composer is not clipped.
      const disclaimer = (await panel
        .getByText('AI responses are generated by local deterministic simulation')
        .boundingBox()) as Box;
      expectInside(disclaimer, (await panel.boundingBox()) as Box, `${size.width}: disclaimer`);
      // The history list is off-canvas until its toggle opens it.
      await expect(panel.getByRole('button', { name: 'Open conversation history' })).toBeVisible();
      const history = (await panel
        .getByRole('complementary', { name: 'Conversation history' })
        .boundingBox()) as Box;
      const panelBox = (await panel.boundingBox()) as Box;
      // Off-canvas: translated out of the workspace's left edge (clipped by it).
      const workspace = await boxOf(page, '[data-widget-panel] .\\@container');
      expect(history.x + history.width, 'history hidden').toBeLessThanOrEqual(workspace.x + 1);
      expect(panelBox.width).toBeGreaterThan(0);
      // Leave the widget closed for the next size.
      await panel.getByRole('button', { name: 'Close assistant' }).click();
    }
  });
});

test.describe('full screen toggle on a phone frame (Lumen Bank)', () => {
  skipWithoutBanking();
  test('enter, then Escape back to the phone; nothing covers the bottom nav', async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'frames need a window wider than the device');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openShell(page, null);
    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'phone');
    const toggle = page.getByRole('button', { name: 'Show full screen' });
    const screen = await boxOf(page, '[data-py-shell-part="screen"]');
    expect(intersects((await toggle.boundingBox()) as Box, screen)).toBe(false);
    expect(intersects(await boxOf(page, '[data-py-demo-badge]'), screen)).toBe(false);
    await toggle.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-py-shell', /.*/);
    await expect(page.locator(FRAME_PARTS)).toHaveCount(0);
    await expectActionsInside(page, await viewportBox(page), 'full screen');
    await expect.poll(() => badgeOverlaps(page), { message: 'badge over controls' }).toEqual([]);
    await expectAccessible(page, testInfo, { label: 'banking-full-screen' });
    await page.locator('body').press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-py-shell', 'phone');
  });
});
