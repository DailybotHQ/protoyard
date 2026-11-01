// @vitest-environment happy-dom
import { ReviewAnchorSchema } from '@protoyard/core/review';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureContext, createAnchor, locatorsFor, resolveAnchor } from '../src/anchors/index.ts';

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
});

describe('fingerprint and orphans', () => {
  it('captures single-line, schema-valid text from page content with controls and bidi marks', () => {
    const root = mount(
      '<button data-testid="bad\nid" aria-label="Pay\u202e now">Total\u200f\n\n# due\u0007</button>'
    );
    const anchor = createAnchor($(root, 'button'), { x: 0, y: 0 }, { root });
    expect(ReviewAnchorSchema.safeParse(anchor).success).toBe(true);
    expect(anchor.fingerprint).toBe('Total # due');
    expect(anchor.locators.map((l) => l.kind)).not.toContain('test-id');
    for (const locator of anchor.locators) expect(locator.value).not.toMatch(/[\n\u202e]/);
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

describe('route and context', () => {
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
