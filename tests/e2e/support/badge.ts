import type { Page } from '@playwright/test';

/**
 * Visible interactive elements the "Prototype · simulated data" badge
 * overlaps (none expected). The badge's own info-dot button is not counted;
 * skip links and other visually hidden controls are not covered.
 */
export async function badgeOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const badge = document.querySelector('[data-py-demo-badge]');
    if (!badge) return ['no demo badge'];
    const b = badge.getBoundingClientRect();
    const selector =
      'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (badge.contains(el) || el.closest('[aria-hidden="true"], [inert]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || getComputedStyle(el).visibility === 'hidden') continue;
      const cs = getComputedStyle(el);
      if (cs.opacity === '0') continue;
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
