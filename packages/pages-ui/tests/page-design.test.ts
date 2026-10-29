import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CardsBlock } from '@protoyard/blocks';
import { type PageDocument, PageDocumentSchema, type PageSection } from '@protoyard/pages';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  highlightedPlan,
  humanizeId,
  pageNavItems,
  plainParagraphs,
  safePageHref,
  sectionDesigns,
  sectionLabel,
} from '../src/page/design.ts';
import PageApp from '../src/page/PageApp.svelte';
import PageHost from '../src/page/PageHost.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

const ctaAction = vi.fn(async () => {});
let withCtaHandler = false;
vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
  getBlockHost: () => ({
    density: 'comfortable',
    canvasMode: 'flow',
    ...(withCtaHandler ? { onCtaAction: ctaAction } : {}),
  }),
}));

afterEach(() => {
  cleanup();
  withCtaHandler = false;
  vi.unstubAllGlobals();
});

const ROOT = resolve(import.meta.dirname, '../../..');

/** The example landing page the lead reviewed (blueprints/pages/tidewater-roasters-landing.json). */
function tidewater(): PageDocument {
  const file = resolve(ROOT, 'blueprints/pages/tidewater-roasters-landing.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as { page: unknown };
  return PageDocumentSchema.parse(json.page);
}

function section(partial: Partial<PageSection> & Pick<PageSection, 'id'>): PageSection {
  return { blocks: [], ...partial };
}

describe('page design decisions (design.ts)', () => {
  it('lays out the example page: hero, body sections, closing band', () => {
    const page = tidewater();
    expect(sectionDesigns(page)).toEqual(['hero', 'body', 'body', 'body', 'body', 'body', 'band']);
  });

  it('keeps explicit roles and never infers a hero when one is declared', () => {
    const designs = sectionDesigns({
      sections: [
        section({ id: 'intro', blocks: [{ type: 'heading', text: 'Title', level: 1 }] }),
        section({ id: 'main', role: 'hero' }),
        section({ id: 'pitch', role: 'cta', blocks: [{ type: 'text', markdown: 'Go' }] }),
        section({ id: 'end', role: 'footer' }),
      ],
    });
    expect(designs).toEqual(['body', 'hero', 'band', 'footer']);
  });

  it('labels navigation with human words, never section ids', () => {
    const labels = pageNavItems(tidewater()).map((item) => [item.label, item.href]);
    expect(labels).toEqual([
      ['Pick a plan', '#plans'],
      ['How it works', '#how-it-works'],
      ['Subscription or the supermarket?', '#compare'],
      ['Join the waitlist', '#waitlist'],
    ]);
  });

  it('prefers a section title, and humanizes ids only when nothing is labelled', () => {
    expect(
      sectionLabel(
        section({ id: 'a', title: 'Features', blocks: [{ type: 'heading', text: 'Other' }] })
      )
    ).toBe('Features');
    expect(humanizeId('how-it-works')).toBe('How it works');
    const unlabelled = pageNavItems({
      sections: [
        section({ id: 'hero', role: 'hero' }),
        section({ id: 'social-proof', blocks: [{ type: 'text', markdown: 'x' }] }),
      ],
    });
    expect(unlabelled.map((item) => item.label)).toEqual(['Social proof']);
  });

  it('lets an explicit page.nav win', () => {
    const nav = [{ id: 'n', label: 'Plans', href: '#plans' }];
    expect(pageNavItems({ ...tidewater(), nav })).toBe(nav);
  });

  it('highlights the accent plan, else the middle of an odd row', () => {
    const cards = (tones: (CardsBlock['items'][number]['tone'] | undefined)[]): CardsBlock => ({
      type: 'cards',
      items: tones.map((tone, i) => ({ title: `Plan ${i}`, ...(tone ? { tone } : {}) })),
    });
    expect(highlightedPlan(cards([undefined, undefined, undefined]))).toBe(1);
    expect(highlightedPlan(cards([undefined, undefined, 'accent']))).toBe(2);
    expect(highlightedPlan(cards([undefined, undefined]))).toBe(-1);
  });

  it('fences hrefs and strips markdown to text', () => {
    expect(safePageHref('#plans')).toBe('#plans');
    expect(safePageHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safePageHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(safePageHref('javascript:alert(1)')).toBeNull();
    // Browsers treat a backslash as a slash in http(s) URLs: these are protocol-relative.
    expect(safePageHref('/\\evil.example')).toBeNull();
    expect(safePageHref('//evil.example')).toBeNull();
    expect(safePageHref('/ok\\..\\x')).toBeNull();
    expect(safePageHref('https://example.com\\@evil.example')).toBeNull();
    // The second fence matches the schema policy: no paths and no http.
    expect(safePageHref('/pricing')).toBeNull();
    expect(safePageHref('http://example.com/a')).toBeNull();
    expect(safePageHref('#/tasks/42')).toBe('#/tasks/42');
    expect(safePageHref('//evil.example')).toBeNull();
    expect(safePageHref('data:text/html,x')).toBeNull();
    expect(plainParagraphs('**Bold** and [a link](https://example.com)\n\n- item')).toEqual([
      'Bold and a link',
      'item',
    ]);
  });
});

describe('PageHost marketing design', () => {
  it('draws the hero at the display scale with unboxed primary and secondary actions', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const h1 = view.getByRole('heading', { level: 1 });
    expect(h1.textContent?.trim()).toBe('Fresh beans at your door every two weeks');
    expect(h1.className).toContain('text-4xl');
    expect(h1.className).toContain('sm:text-5xl');
    expect(h1.className).toContain('lg:text-6xl');

    const hero = view.container.querySelector('[data-py-page-section="hero"]') as HTMLElement;
    expect(hero.getAttribute('data-section-role')).toBe('hero');
    expect(hero.id).toBe('top');
    const actions = hero.querySelector('[data-py-page-actions="hero"]') as HTMLElement;
    const links = within(actions).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#waitlist', '#plans']);
    // Primary first, then an outline action (texuli's button classes).
    expect(links[0]?.className).toContain('tx-button--default');
    expect(links[1]?.className).toContain('tx-button--outline');
    expect(links[1]?.className).not.toContain('tx-button--default');
    // Stacks full width on phones, sits in a row from `sm`.
    expect(actions.lastElementChild?.className).toContain('flex-col');
    expect(actions.lastElementChild?.className).toContain('sm:flex-row');
    // No CTA card around the hero buttons.
    expect(hero.querySelector('[data-py-mock-block-host]')).toBeNull();
  });

  it('uses human labels in the navigation', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const nav = view.getByRole('navigation', { name: 'Main navigation' });
    const names = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent?.trim());
    expect(names).toEqual([
      'Pick a plan',
      'How it works',
      'Subscription or the supermarket?',
      'Join the waitlist',
    ]);
    for (const id of ['hero', 'proof', 'how-it-works', 'closing']) expect(names).not.toContain(id);
  });

  it('renders the figures as one stat row that stacks on phones', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const stats = view.container.querySelector('[data-py-page-stats]') as HTMLElement;
    // One Texuli Stat per figure, in a list that stacks on phones.
    const list = stats.querySelector('ul') as HTMLElement;
    expect(list.className).toContain('sm:grid-cols-3');
    expect(list.className).not.toMatch(/(^|\s)grid-cols-/);
    const terms = [...list.querySelectorAll('[data-tx-stat-label]')].map((label) =>
      label.textContent?.trim()
    );
    expect(terms).toEqual([
      'From roast to shipping',
      'Single origins this season',
      'Example taster rating',
    ]);
    expect(
      [...list.querySelectorAll('[data-tx-stat-value]')].map((value) => value.textContent?.trim())
    ).toEqual(['48 h', '12', '4.8/5']);
  });

  it('a section heading adds no nested landmark or padding of its own', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const headers = [...view.container.querySelectorAll('[data-py-page-section-header]')];
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(header.tagName).toBe('HEADER');
      // The nearest region is the page section itself: no section wraps just the heading.
      expect(header.closest('section')?.hasAttribute('data-py-page-section')).toBe(true);
    }
  });

  it('renders plans as pricing columns with the middle plan highlighted', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const pricing = view.container.querySelector('[data-py-page-pricing]') as HTMLElement;
    expect(pricing.querySelector('ul')?.className).toContain('md:grid-cols-3');
    const plans = [...pricing.querySelectorAll('[data-py-page-plan]')];
    expect(plans.map((plan) => plan.querySelector('h3')?.textContent?.trim())).toEqual([
      'Starter',
      'Household',
      'Office',
    ]);
    expect(plans.map((plan) => plan.getAttribute('data-highlighted'))).toEqual([
      null,
      'true',
      null,
    ]);
    expect(plans[1]?.className).toContain('border-primary');
  });

  it('renders numbered steps as a row with connectors and a phone rail', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const steps = view.container.querySelector('[data-py-page-steps]') as HTMLElement;
    const list = steps.querySelector('ol') as HTMLElement;
    expect(list.className).toContain('md:grid-cols-3');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    // Two joins between three steps, hidden from assistive technology.
    const connectors = list.querySelectorAll('[data-py-page-step-connector]');
    expect(connectors).toHaveLength(2);
    expect(connectors[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(list.querySelectorAll('[data-py-page-step-rail]')).toHaveLength(2);
    expect(within(list).getByRole('heading', { name: 'Roast' })).toBeTruthy();
  });

  it('renders the testimonial as a pull quote with its attribution', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const quote = view.container.querySelector('[data-py-page-quote]') as HTMLElement;
    expect(quote.tagName).toBe('FIGURE');
    expect(quote.querySelector('blockquote')?.textContent?.trim()).toBe(
      'The first bag converted our whole office.'
    );
    expect(quote.querySelector('figcaption')?.textContent).toContain('Riley Example');
  });

  it('closes with a primary band and alternates body backgrounds', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const closing = view.container.querySelector('[data-py-page-section="closing"]') as HTMLElement;
    const band = closing.querySelector('[data-py-page-band]') as HTMLElement;
    expect(band.className).toContain('bg-primary');
    expect(band.className).toContain('text-primary-foreground');
    expect(band.textContent).toContain('Questions? Write to hello@tidewater.example.');
    expect(within(band).getByRole('link', { name: 'Back to top' }).getAttribute('href')).toBe(
      '#top'
    );

    const tinted = [...view.container.querySelectorAll('[data-section-role="body"]')].map((el) =>
      el.getAttribute('data-tinted')
    );
    expect(tinted).toEqual([null, 'true', null, 'true', null]);
  });

  it('draws section openings as section headers at the marketing scale', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const heading = view.getByRole('heading', { level: 2, name: 'Pick a plan' });
    expect(heading.className).toContain('text-3xl');
    expect(heading.className).toContain('sm:text-4xl');
  });

  it('highlights the section in view and marks it as the current location', async () => {
    let callback: IntersectionObserverCallback = () => {};
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const view = render(PageHost, { props: { page: tidewater() } });
    const target = view.container.querySelector('#how-it-works') as HTMLElement;
    callback(
      [
        {
          isIntersecting: true,
          target,
          boundingClientRect: { top: 10 } as DOMRectReadOnly,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
    const link = await view.findByRole('link', { name: 'How it works', current: 'location' });
    expect(link.className).toContain('bg-muted');
    expect(view.getByRole('link', { name: 'Pick a plan' }).getAttribute('aria-current')).toBeNull();
  });

  it('scrolls without animation when reduced motion is asked for', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const view = render(PageHost, { props: { page: tidewater() } });
    const target = view.container.querySelector('#plans') as HTMLElement;
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    await fireEvent.click(view.getByRole('link', { name: 'Pick a plan' }));
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('routes actions through the host handler when one is set (pending feedback)', async () => {
    withCtaHandler = true;
    const view = render(PageHost, { props: { page: tidewater() } });
    const hero = view.container.querySelector('[data-py-page-actions="hero"]') as HTMLElement;
    await fireEvent.click(within(hero).getByRole('button', { name: 'Join the waitlist' }));
    expect(ctaAction).toHaveBeenCalledWith({ label: 'Join the waitlist', href: '#waitlist' });
  });

  it('renders untrusted text as text and drops unsafe links', () => {
    const page: PageDocument = {
      id: 'unsafe',
      title: 'Unsafe',
      sections: [
        {
          id: 'hero',
          blocks: [
            { type: 'heading', level: 1, text: '<img src=x onerror=alert(1)>' },
            {
              type: 'cta',
              actions: [
                { label: 'Go', href: '#go' },
                { label: 'Bad', href: 'javascript:alert(1)' },
              ],
            },
          ],
        },
        {
          id: 'voices',
          blocks: [{ type: 'quote', quote: '<script>alert(1)</script> **loved it**' }],
        },
      ],
    };
    const view = render(PageHost, { props: { page } });
    expect(view.container.querySelector('img, script')).toBeNull();
    expect(view.queryByRole('link', { name: 'Bad' })).toBeNull();
    expect(view.getByRole('link', { name: 'Go' }).getAttribute('href')).toBe('#go');
    expect(view.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(view.container.querySelector('blockquote')?.textContent?.trim()).toBe(
      '<script>alert(1)</script> loved it'
    );
  });

  it('wires form blocks to the page form services from PageApp', async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    const view = render(PageApp, {
      props: { page: tidewater(), formServices: { submit } as never },
    });
    const form = view.container.querySelector('[data-py-page-block="form"]') as HTMLElement;
    const email = await within(form).findByRole('textbox', { name: /Email/ });
    expect((email as HTMLInputElement).disabled).toBe(false);
    expect(form.textContent).not.toContain('Handled by the page form runtime');
  });

  it('keeps the block preview for a form when no services are provided', () => {
    const view = render(PageHost, { props: { page: tidewater() } });
    const form = view.container.querySelector('[data-py-page-block="form"]') as HTMLElement;
    expect(form.querySelector('[data-py-mock-block-host]')).not.toBeNull();
  });
});
