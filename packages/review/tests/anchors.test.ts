// @vitest-environment happy-dom
import { ReviewAnchorSchema } from '@protoyard/core/review';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anchorMatchesRoute,
  anchorPoint,
  captureContext,
  createAnchor,
  isGeneratedId,
  LOW_CONFIDENCE,
  locatorsFor,
  resolveAnchor,
} from '../src/anchors/index.ts';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}
const $ = (root: Element, selector: string) => root.querySelector(selector) as HTMLElement;
const box = (el: Element, rect: { left: number; top: number; width: number; height: number }) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  } as DOMRect);

const PAGE = `
  <header><nav aria-label="Primary"><a href="#/">Home</a><a href="#/deals">Deals</a></nav></header>
  <main>
    <section aria-label="Pipeline">
      <article data-py-anchor="deal-card" data-testid="card-1" id="deal-acme"><h3>Acme renewal</h3><p>$12,000</p></article>
      <button type="button">Save</button>
      <button type="button" id="bits-12">Save</button>
    </section>
    <ul><li>One</li><li>Two</li><li><span>Three</span></li></ul>
  </main>`;

describe('generated ids', () => {
  it('skips ids that change between renders or builds', () => {
    for (const id of [
      'bits-12',
      'bits-dialog-content',
      '42',
      ':r3:',
      'c1',
      'grid-c1-err',
      'feed-s12-day',
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      'a8f3k29d0x7q2m',
    ]) {
      expect(isGeneratedId(id), id).toBe(true);
    }
    for (const id of ['deal-acme', 'main-nav', 'save', 'invoice_total']) {
      expect(isGeneratedId(id), id).toBe(false);
    }
  });
});

describe('locator ladder', () => {
  it('lists every applicable locator, strongest first', () => {
    const root = mount(PAGE);
    const card = $(root, 'article');
    expect(locatorsFor(card, root).map((l) => l.kind)).toEqual([
      'py-anchor',
      'test-id',
      'id',
      'role-path',
      'css-path',
    ]);
    // A button with a generated id: no id locator, a role path inside the named region.
    const generated = $(root, '#bits-12');
    const ladder = locatorsFor(generated, root);
    expect(ladder.map((l) => l.kind)).toEqual(['role-path', 'css-path']);
    expect(JSON.parse(ladder[0]?.value ?? '')).toEqual({
      landmark: { role: 'region', name: 'Pipeline' },
      role: 'button',
      name: 'Save',
      index: 1,
    });
    // Generic elements with no name fall to the CSS path.
    const span = $(root, 'li:nth-of-type(3) span');
    expect(locatorsFor(span, root)).toEqual([
      { kind: 'css-path', value: ':scope > main > ul > li:nth-of-type(3) > span' },
    ]);
    // The CSS path starts at the nearest stable id.
    expect(locatorsFor($(root, 'article p'), root).at(-1)?.value).toBe('#deal-acme > p');
  });

  it('resolves through the ladder when stronger locators disappear', () => {
    const root = mount(PAGE);
    const anchor = createAnchor(
      $(root, 'article'),
      { x: 0, y: 0 },
      { root, route: { pattern: '/deals', path: '/deals' } }
    );
    expect(resolveAnchor(anchor, root)).toMatchObject({
      orphaned: false,
      confidence: 1,
      fingerprintMatches: true,
      locator: { kind: 'py-anchor' },
    });
    const card = $(root, 'article');
    card.removeAttribute('data-py-anchor');
    expect(resolveAnchor(anchor, root)).toMatchObject({
      confidence: 0.95,
      locator: { kind: 'test-id' },
    });
    card.removeAttribute('data-testid');
    expect(resolveAnchor(anchor, root)).toMatchObject({ confidence: 0.9, locator: { kind: 'id' } });
    card.removeAttribute('id');
    // The article's name is its text; the role path still finds it in the region.
    const result = resolveAnchor(anchor, root);
    expect(result).toMatchObject({ orphaned: false, locator: { kind: 'role-path' } });
    expect(result.element).toBe(card);
  });

  it('finds the same button again by role and name after reflow', () => {
    const root = mount(PAGE);
    const anchor = createAnchor($(root, '#bits-12'), { x: 0, y: 0 }, { root });
    // Re-render: generated ids change and a new element is inserted before.
    $(root, '#bits-12').id = 'bits-99';
    $(root, 'section').insertAdjacentHTML('afterbegin', '<p>New banner</p>');
    const result = resolveAnchor(anchor, root);
    expect(result.element).toBe($(root, '#bits-99'));
    expect(result).toMatchObject({ locator: { kind: 'role-path' }, confidence: 0.8 });
  });
});

describe('fingerprint and orphans', () => {
  it('lowers confidence when the text changed, and prefers a locator whose text still matches', () => {
    const root = mount(PAGE);
    const anchor = createAnchor($(root, 'article'), { x: 0, y: 0 }, { root });
    expect(anchor.fingerprint).toBe('Acme renewal $12,000');
    $(root, 'article p').textContent = '$15,000';
    const changed = resolveAnchor(anchor, root);
    expect(changed).toMatchObject({ orphaned: false, fingerprintMatches: false, confidence: 0.5 });
    expect(changed.confidence).toBeLessThan(LOW_CONFIDENCE); // drawn dashed

    // Two elements share a test id; the one with matching text wins.
    const twins = mount('<div data-testid="row">Alpha</div><div data-testid="row">Beta</div>');
    const beta = twins.querySelectorAll('[data-testid="row"]')[1] as Element;
    const pick = resolveAnchor(
      { locators: [{ kind: 'test-id', value: 'row' }], fingerprint: 'beta' },
      twins
    );
    expect(pick.element).toBe(beta);
    expect(pick.confidence).toBeCloseTo(0.855);
  });

  it('marks a pin orphaned when its element is gone, and tolerates bad locators', () => {
    const root = mount(PAGE);
    const anchor = createAnchor($(root, 'li:nth-of-type(3) span'), { x: 0, y: 0 }, { root });
    $(root, 'ul').remove();
    expect(resolveAnchor(anchor, root)).toEqual({ orphaned: true, element: null, confidence: 0 });
    expect(
      resolveAnchor(
        {
          locators: [
            { kind: 'role-path', value: '{not json' },
            { kind: 'css-path', value: ':::' },
          ],
        },
        root
      ).orphaned
    ).toBe(true);
    // An id outside the root does not count.
    mount('<p id="elsewhere">x</p>');
    expect(resolveAnchor({ locators: [{ kind: 'id', value: 'elsewhere' }] }, root).orphaned).toBe(
      true
    );
  });
});

describe('offset', () => {
  it('stores the click relative to the element box, independent of scale', () => {
    const root = mount(PAGE);
    const card = $(root, 'article');
    // Inside a frame scaled to 50%: the box is half size, and so is the click distance.
    box(card, { left: 100, top: 40, width: 150, height: 50 });
    const anchor = createAnchor(card, { x: 137.5, y: 50 }, { root });
    expect(anchor.offset).toEqual({ x: 0.25, y: 0.2 });
    // At full scale the same anchor lands on the same relative spot.
    box(card, { left: 200, top: 80, width: 300, height: 100 });
    expect(anchorPoint(anchor, card)).toEqual({ x: 275, y: 100 });
    // Clicks just outside clamp to the edge; a zero-size box uses the center.
    expect(createAnchor(card, { x: 9999, y: -5 }, { root }).offset).toEqual({ x: 1, y: 0 });
    box(card, { left: 0, top: 0, width: 0, height: 0 });
    expect(createAnchor(card, { x: 3, y: 3 }, { root }).offset).toEqual({ x: 0.5, y: 0.5 });
    expect(ReviewAnchorSchema.safeParse(anchor).success).toBe(true);
  });
});

describe('route and context', () => {
  it('takes the hash route by default and matches patterns', () => {
    const root = mount(PAGE);
    location.hash = '#/deals/7?tab=notes';
    const anchor = createAnchor($(root, 'article'), { x: 0, y: 0 }, { root });
    expect(anchor.route).toEqual({ pattern: '/deals/7', path: '/deals/7' });
    const patterned = { route: { pattern: '/deals/:id', path: '/deals/7' } };
    expect(anchorMatchesRoute(patterned, '/deals/7')).toBe(true);
    expect(anchorMatchesRoute(patterned, '/deals/9')).toBe(true);
    expect(anchorMatchesRoute(patterned, '/deals')).toBe(false);
    expect(anchorMatchesRoute(patterned, '/contacts/7')).toBe(false);
    location.hash = '';
  });

  it('captures the review context and validates it', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    expect(
      captureContext({
        scenario: 'busy-quarter',
        persona: 'p-marta',
        mode: 'dark',
        theme: 'ocean',
        layout: undefined,
        buildId: 'b-2026-10-19',
      })
    ).toEqual({
      scenario: 'busy-quarter',
      persona: 'p-marta',
      mode: 'dark',
      theme: 'ocean',
      buildId: 'b-2026-10-19',
      viewport: { width: 390, height: 844 },
    });
    expect(captureContext({ viewport: { width: 1280, height: 800 } })).toEqual({
      viewport: { width: 1280, height: 800 },
    });
    expect(() => captureContext({ scenario: 'Not Kebab' })).toThrow();
  });
});
