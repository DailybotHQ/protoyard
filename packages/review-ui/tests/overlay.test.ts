// @vitest-environment happy-dom
import type { ReviewAnchor, ReviewComment } from '@protoyard/core/review';
import { createAnchor } from '@protoyard/review/anchors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReviewOverlay } from '../src/overlay/index.ts';

const handles: Array<{ destroy: () => void }> = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  document.body.innerHTML = '';
  window.location.hash = '';
});

function setup() {
  const root = document.createElement('main');
  const target = document.createElement('button');
  target.textContent = 'Open invoice';
  root.append(target);
  document.body.append(root);
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 30, 80, 32));
  const onPlace = vi.fn();
  const handle = createReviewOverlay({ root, onPlace });
  handles.push(handle);
  return { root, target, onPlace };
}

function comment(
  id: string,
  anchor: ReviewAnchor,
  overrides: Partial<ReviewComment> = {}
): ReviewComment {
  return {
    formatVersion: 1,
    id,
    threadId: id,
    slug: 'invoice-demo',
    body: 'The invoice total needs review.',
    author: { name: 'Alex Reviewer', clientId: 'client_12345678' },
    createdAt: '2026-10-19T12:00:00Z',
    anchor,
    context: { viewport: { width: 1280, height: 800 } },
    ...overrides,
  };
}

function key(target: EventTarget, keyValue: string, options: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: keyValue, bubbles: true, ...options }));
}

describe('review comment overlay', () => {
  it('toggles from the toolbar and C, exits on Escape, and ignores C while typing', () => {
    setup();
    const toggle = document.querySelector<HTMLButtonElement>('[data-py-review-toggle]');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    toggle?.click();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    key(document.body, 'Escape');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');

    const input = document.createElement('input');
    document.body.append(input);
    key(input, 'c');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    key(document.body, 'c');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  });

  it('captures clicks beneath the overlay and reports an anchor to the caller', async () => {
    const { root, target, onPlace } = setup();
    const appClick = vi.fn();
    target.addEventListener('click', appClick);
    const elementsFromPoint = vi.fn(() => [
      document.querySelector('[data-py-review-capture]')!,
      target,
    ]);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: elementsFromPoint,
    });
    document.querySelector<HTMLButtonElement>('[data-py-review-toggle]')?.click();
    const capture = document.querySelector('[data-py-review-capture]');
    expect((capture as HTMLElement).style.width).toBe('320px');
    expect((capture as HTMLElement).style.height).toBe('240px');
    capture?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 48, clientY: 40 }));
    await Promise.resolve();
    expect(elementsFromPoint).toHaveBeenCalledWith(48, 40);
    expect(appClick).not.toHaveBeenCalled();
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace.mock.calls[0]?.[0]).toMatchObject({
      locators: expect.any(Array),
      offset: { x: 0.1, y: 0.3125 },
    });
    expect(root.contains(target)).toBe(true);
  });

  it('supports Shift+C on the focused element and arrow-key crosshair placement', async () => {
    const { root, target, onPlace } = setup();
    target.focus();
    key(target, 'C', { shiftKey: true });
    await Promise.resolve();
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace.mock.calls[0]?.[0].offset).toEqual({ x: 0.5, y: 0.5 });

    onPlace.mockClear();
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [document.querySelector('[data-py-review-place]')!, target]),
    });
    key(document.body, 'c');
    const place = document.querySelector<HTMLButtonElement>('[data-py-review-place]');
    expect(place?.getAttribute('aria-label')).toBe('Place pin here');
    const startX = Number.parseFloat(place?.style.left ?? '0');
    key(place as HTMLButtonElement, 'ArrowRight');
    const nextX = Number.parseFloat(
      document.querySelector<HTMLButtonElement>('[data-py-review-place]')?.style.left ?? '0'
    );
    expect(nextX).toBe(startX + 16);
    key(document.querySelector('[data-py-review-place]') as HTMLButtonElement, 'Enter');
    await Promise.resolve();
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(root.contains(target)).toBe(true);
  });

  it('shows pending feedback while the caller saves a newly placed anchor', async () => {
    const root = document.createElement('main');
    const target = document.createElement('button');
    root.append(target);
    document.body.append(root);
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 30, 80, 32));
    let finishSave: (() => void) | undefined;
    const onPlace = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    const handle = createReviewOverlay({ root, onPlace });
    handles.push(handle);
    const elementsFromPoint = vi.fn(() => [
      document.querySelector('[data-py-review-capture]')!,
      target,
    ]);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: elementsFromPoint,
    });
    document.querySelector<HTMLButtonElement>('[data-py-review-toggle]')?.click();
    document
      .querySelector('[data-py-review-capture]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 48, clientY: 40 }));
    const toggle = document.querySelector<HTMLButtonElement>('[data-py-review-toggle]');
    expect(toggle?.textContent).toBe('Saving comment…');
    expect(toggle?.disabled).toBe(true);
    finishSave?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(toggle?.textContent).toBe('Add comment');
    expect(toggle?.disabled).toBe(false);
  });

  it('draws accessible thread pins, hides resolved and orphaned pins, and expands close clusters', () => {
    const { root, target } = setup();
    const anchor = createAnchor(
      target,
      { x: 48, y: 40 },
      { root, route: { pattern: '/', path: '/' } }
    );
    const closeTarget = document.createElement('span');
    closeTarget.textContent = 'Status';
    root.append(closeTarget);
    vi.spyOn(closeTarget, 'getBoundingClientRect').mockReturnValue(new DOMRect(48, 40, 80, 32));
    const closeAnchor = createAnchor(
      closeTarget,
      { x: 56, y: 48 },
      { root, route: { pattern: '/', path: '/' } }
    );
    const orphanAnchor = {
      ...anchor,
      locators: [{ kind: 'id' as const, value: 'removed-target' }],
    };
    const first = comment('thread_0000001', anchor);
    const reply = comment('reply_00000001', anchor, {
      threadId: first.id,
      anchor: undefined,
      context: undefined,
      body: 'A reply.',
    });
    const second = comment('thread_0000002', closeAnchor, { body: 'A nearby note.' });
    const resolved = comment('thread_0000003', anchor, { resolvedAt: '2026-10-19T13:00:00Z' });
    const orphan = comment('thread_0000004', orphanAnchor);
    const onOpen = vi.fn();
    const handle = createReviewOverlay({
      root,
      comments: [first, reply, second, resolved, orphan],
      onPlace: vi.fn(),
      onOpen,
    });
    handles.push(handle);
    const cluster = document.querySelector<HTMLButtonElement>('[data-py-review-pin]');
    expect(cluster?.getAttribute('aria-label')).toBe('2 comment threads');
    expect(document.querySelectorAll('[data-py-review-pin]')).toHaveLength(1);
    cluster?.click();
    const pins = [...document.querySelectorAll<HTMLButtonElement>('[data-py-review-pin]')];
    expect(pins).toHaveLength(2);
    expect(pins.some((pin) => pin.getAttribute('aria-label')?.includes('1 reply'))).toBe(true);
    pins[0]?.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(pins.some((pin) => pin.getAttribute('aria-label')?.includes('thread_0000003'))).toBe(
      false
    );
    expect(pins.some((pin) => pin.getAttribute('aria-label')?.includes('thread_0000004'))).toBe(
      false
    );
    handle.focusThread(first.id);
    expect(
      document
        .querySelector(`[data-py-review-pin][data-thread-id="${first.id}"]`)
        ?.getAttribute('data-pulsing')
    ).toBe('');
    expect(document.querySelector('style')?.textContent).toContain('prefers-reduced-motion:reduce');
  });

  it('moves its host into the device portal when the renderer marks the screen', async () => {
    setup();
    const portal = document.createElement('section');
    document.body.append(portal);
    portal.dataset.pyPortalRoot = '';
    await Promise.resolve();
    expect(portal.querySelector('[data-py-review-overlay]')).not.toBeNull();
  });
});
