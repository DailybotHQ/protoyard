import type { Page } from '@playwright/test';

/** Visible app controls the collapsed launcher overlaps (none expected). */
export async function launcherOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-py-review-toolbar]');
    const button = nav?.querySelector('button');
    if (!button) return ['no launcher'];
    const b = button.getBoundingClientRect();
    const out: string[] = [];
    const selector =
      'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (
        nav?.contains(el) ||
        el.closest('[aria-hidden="true"], [inert], [data-py-review-overlay]')
      )
        continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.opacity === '0') continue;
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
