import type { ReviewAnchor, ReviewComment } from '@protoyard/core/review';
import {
  anchorMatchesRoute,
  anchorPoint,
  createAnchor,
  resolveAnchor,
} from '@protoyard/review/anchors';

export interface ReviewOverlayOptions {
  /** The prototype root used for anchor resolution and comment capture. */
  root: HTMLElement;
  /** Root comments and their replies, supplied by the review adapter layer. */
  comments?: readonly ReviewComment[];
  /** Persist the new anchor through the caller's review service. */
  onPlace: (anchor: ReviewAnchor) => void | Promise<void>;
  /** Open the host comment composer for the clicked element in composer-only mode. */
  onCommentInClaude?: (element: Element) => void | Promise<void>;
  /** Open the thread from a pin. */
  onOpen?: (threadId: string) => void;
  /** An optional root comment to pulse and bring into view. */
  focusedThreadId?: string;
  /** Resolved comments are hidden until the caller opts in. */
  showResolved?: boolean;
  /**
   * Render the overlay's own "Add comment" button (default true). Hosts with
   * their own control (the review toolbar) pass false, so no extra button
   * floats over the app.
   */
  toggle?: boolean;
  /**
   * Called with the root threads anchored on the current screen whose element
   * is gone (after a scenario switch or a data change), whenever that list
   * changes. The comments panel shows them as orphaned.
   */
  onOrphans?: (threadIds: string[]) => void;
  /** Comment mode turned on or off (toggle, C, Escape, or after placing a pin). */
  onActiveChange?: (active: boolean) => void;
}

export interface ReviewOverlayHandle {
  setActive(active: boolean): void;
  setComments(comments: readonly ReviewComment[]): void;
  focusThread(threadId: string | undefined): void;
  setShowResolved(show: boolean): void;
  destroy(): void;
}

const STYLE = `
[data-py-review-overlay]{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font:inherit;color:var(--py-foreground,#18181b)}
[data-py-review-overlay] [data-py-review-capture]{position:absolute;pointer-events:auto;cursor:crosshair;background:transparent;touch-action:none}
[data-py-review-overlay] [data-py-review-pin],[data-py-review-overlay] [data-py-review-place]{position:absolute;pointer-events:auto;box-sizing:border-box;border:2px solid #fff;border-radius:999px;background:var(--py-primary,#6d28d9);color:var(--py-primary-foreground,#fff);box-shadow:0 0 0 2px var(--py-primary,#6d28d9),0 2px 8px rgb(0 0 0 / .28);font-family:inherit;font-size:13px;font-weight:600;line-height:1.2;cursor:pointer}
[data-py-review-overlay] [data-py-review-pin]{min-width:30px;min-height:30px;padding:5px 8px;transform:translate(-50%,-50%);white-space:nowrap}
[data-py-review-overlay] [data-py-review-place]{width:30px;height:30px;padding:0;transform:translate(-50%,-50%);cursor:crosshair}
[data-py-review-overlay] [data-py-review-pin]:focus-visible,[data-py-review-overlay] [data-py-review-place]:focus-visible,[data-py-review-overlay] [data-py-review-toggle]:focus-visible{outline:3px solid var(--py-ring,#7c3aed);outline-offset:4px}
[data-py-review-overlay] [data-py-review-toggle]{position:absolute;right:12px;top:12px;z-index:2;pointer-events:auto;border:1px solid var(--py-border,#d4d4d8);border-radius:999px;background:var(--py-surface,#fff);color:var(--py-surface-foreground,#18181b);padding:8px 12px;font-family:inherit;font-size:13px;font-weight:600;line-height:1.2;cursor:pointer;box-shadow:0 2px 8px rgb(0 0 0 / .18)}
[data-py-review-overlay] [data-py-review-status]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
[data-py-review-overlay] [data-py-review-pin][data-low-confidence]{border-style:dashed}
[data-py-review-overlay] [data-pulsing]{animation:py-review-pin-pulse 1.4s ease-in-out infinite}
@keyframes py-review-pin-pulse{50%{box-shadow:0 0 0 5px rgb(255 255 255 / .85),0 0 0 8px var(--py-primary,#6d28d9)}}
@media(prefers-reduced-motion:reduce){[data-py-review-overlay] [data-pulsing]{animation:none}}
`;

interface Pin {
  comment: ReviewComment;
  element: Element;
  point: { x: number; y: number };
  confidence: number;
}

interface PinGroup {
  pins: Pin[];
  x: number;
  y: number;
}

function routePath(): string {
  const hash = (typeof location === 'undefined' ? '' : location.hash.slice(1).split('?')[0]) ?? '';
  return hash.startsWith('/') ? hash : '/';
}

function currentPortal(document: Document): HTMLElement {
  return document.querySelector<HTMLElement>('[data-py-portal-root]') ?? document.body;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'
    )
  );
}

function elementAt(root: HTMLElement, x: number, y: number, overlay: HTMLElement): Element | null {
  const elements = root.ownerDocument.elementsFromPoint?.(x, y) ?? [];
  return (
    elements.find(
      (element) => element !== overlay && !overlay.contains(element) && root.contains(element)
    ) ?? null
  );
}

function clusterPins(pins: Pin[]): PinGroup[] {
  const unseen = new Set(pins.map((_, index) => index));
  const groups: PinGroup[] = [];
  while (unseen.size) {
    const first = unseen.values().next().value as number;
    unseen.delete(first);
    const indexes = [first];
    for (let cursor = 0; cursor < indexes.length; cursor++) {
      const pin = pins[indexes[cursor] as number];
      if (!pin) continue;
      for (const candidate of [...unseen]) {
        const other = pins[candidate];
        if (!other) continue;
        if (Math.hypot(pin.point.x - other.point.x, pin.point.y - other.point.y) < 24) {
          unseen.delete(candidate);
          indexes.push(candidate);
        }
      }
    }
    const members = indexes.map((index) => pins[index]).filter((pin): pin is Pin => Boolean(pin));
    groups.push({
      pins: members,
      x: members.reduce((sum, pin) => sum + pin.point.x, 0) / members.length,
      y: members.reduce((sum, pin) => sum + pin.point.y, 0) / members.length,
    });
  }
  return groups;
}

function pinLabel(comment: ReviewComment, comments: readonly ReviewComment[]): string {
  const replies = comments.filter((item) => item.threadId === comment.threadId).length - 1;
  const excerpt = comment.body.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `Comment thread by ${comment.author.name}: ${excerpt}, ${replies} ${replies === 1 ? 'reply' : 'replies'}`;
}

/**
 * Mount the lazy comment overlay. It owns only capture and pin presentation;
 * writes remain with the caller's adapter-backed service.
 */
export function createReviewOverlay(options: ReviewOverlayOptions): ReviewOverlayHandle {
  const { root } = options;
  const document = root.ownerDocument;
  let comments = [...(options.comments ?? [])];
  let active = false;
  let placing = false;
  let showResolved = options.showResolved ?? false;
  let focusedThreadId = options.focusedThreadId;
  let crosshair: { x: number; y: number } | null = null;
  let lastFocusedElement: Element | null = null;
  const expandedClusters = new Set<string>();
  const overlay = document.createElement('div');
  overlay.dataset.pyReviewOverlay = '';
  // A labelled group: a bare div may not carry aria-label (axe aria-prohibited-attr).
  overlay.setAttribute('role', 'group');
  overlay.setAttribute('aria-label', 'Prototype review comments');
  const style = document.createElement('style');
  style.textContent = STYLE;
  overlay.append(style);
  const status = document.createElement('span');
  status.dataset.pyReviewStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  overlay.append(status);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.pyReviewToggle = '';
  toggle.addEventListener('click', () => setActive(!active));
  if (options.toggle !== false) overlay.append(toggle);

  let portal = currentPortal(document);
  portal.append(overlay);
  let capture: HTMLDivElement | undefined;
  let placeButton: HTMLButtonElement | undefined;
  const observedTargets = new Set<Element>();
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(render);
  resize?.observe(root);
  const portalObserver =
    typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(render);
  // The app's own DOM changes (a scenario switch, a row removed) re-resolve pins once per frame.
  let frame = 0;
  const appObserver =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver((records) => {
          // Pins live inside the root in a device shell: their own redraws must not loop.
          if (frame || records.every((record) => overlay.contains(record.target))) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            render();
          });
        });
  appObserver?.observe(root, { childList: true, subtree: true });
  portalObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-py-portal-root'],
    subtree: true,
  });

  function setActive(value: boolean): void {
    if (
      value &&
      document.activeElement instanceof Element &&
      root.contains(document.activeElement)
    ) {
      lastFocusedElement = document.activeElement;
    }
    const changed = active !== value;
    active = value;
    if (changed) options.onActiveChange?.(value);
    crosshair = value ? rootCenter() : null;
    render();
    if (value) placeButton?.focus();
    else if (lastFocusedElement && root.contains(lastFocusedElement)) {
      (lastFocusedElement as HTMLElement).focus?.();
    }
  }

  function rootCenter(): { x: number; y: number } {
    const rect = root.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  let lastOrphans = '';
  function reportOrphans(): void {
    if (!options.onOrphans) return;
    const ids = comments
      .filter(
        (comment) =>
          comment.id === comment.threadId &&
          comment.anchor &&
          anchorMatchesRoute(comment.anchor, routePath()) &&
          resolveAnchor(comment.anchor, root).orphaned
      )
      .map((comment) => comment.id)
      .sort();
    const key = ids.join(' ');
    if (key === lastOrphans) return;
    lastOrphans = key;
    options.onOrphans(ids);
  }

  function resolvePins(): Pin[] {
    const roots = comments.filter((comment) => comment.id === comment.threadId);
    const pins: Pin[] = [];
    for (const comment of roots) {
      if (!comment.anchor || (!showResolved && comment.resolvedAt)) continue;
      if (!anchorMatchesRoute(comment.anchor, routePath())) continue;
      const resolved = resolveAnchor(comment.anchor, root);
      if (resolved.orphaned) continue;
      pins.push({
        comment,
        element: resolved.element,
        point: anchorPoint(comment.anchor, resolved.element),
        confidence: resolved.confidence,
      });
    }
    return pins;
  }

  function localPoint(point: { x: number; y: number }): { x: number; y: number } {
    if (portal === document.body || portal === document.documentElement) return point;
    const rect = portal.getBoundingClientRect();
    const scaleX = rect.width > 0 ? portal.clientWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? portal.clientHeight / rect.height : 1;
    return { x: (point.x - rect.left) * scaleX, y: (point.y - rect.top) * scaleY };
  }

  function clearPins(): void {
    for (const child of [...overlay.children]) {
      if (child !== style && child !== status && child !== toggle) child.remove();
    }
  }

  function makePinButton(pin: Pin, point: { x: number; y: number }): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.pyReviewPin = '';
    button.dataset.threadId = pin.comment.threadId;
    if (pin.confidence < 0.7) button.dataset.lowConfidence = '';
    if (pin.comment.id === focusedThreadId) button.dataset.pulsing = '';
    const label = pinLabel(pin.comment, comments);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = String(pin.comment.body.length ? '●' : '•');
    const local = localPoint(point);
    button.style.left = `${local.x}px`;
    button.style.top = `${local.y}px`;
    button.addEventListener('click', () => options.onOpen?.(pin.comment.threadId));
    return button;
  }

  function renderPins(): void {
    const pins = resolvePins();
    const currentTargets = new Set(pins.map((pin) => pin.element));
    for (const element of observedTargets) {
      if (!currentTargets.has(element)) {
        resize?.unobserve(element);
        observedTargets.delete(element);
      }
    }
    for (const element of currentTargets) {
      if (!observedTargets.has(element)) {
        resize?.observe(element);
        observedTargets.add(element);
      }
    }
    for (const group of clusterPins(pins)) {
      if (group.pins.length === 1) {
        const pin = group.pins[0];
        if (pin) overlay.append(makePinButton(pin, pin.point));
        continue;
      }
      const key = group.pins
        .map((pin) => pin.comment.threadId)
        .sort()
        .join(':');
      if (!expandedClusters.has(key)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.pyReviewPin = '';
        button.dataset.threadIds = group.pins.map((pin) => pin.comment.threadId).join(' ');
        button.setAttribute('aria-label', `${group.pins.length} comment threads`);
        button.textContent = String(group.pins.length);
        const local = localPoint(group);
        button.style.left = `${local.x}px`;
        button.style.top = `${local.y}px`;
        button.addEventListener('click', () => {
          expandedClusters.add(key);
          render();
          overlay.querySelector<HTMLButtonElement>('[data-py-review-pin]')?.focus();
        });
        overlay.append(button);
      } else {
        group.pins.forEach((pin, index) => {
          const spread = (index - (group.pins.length - 1) / 2) * 26;
          overlay.append(makePinButton(pin, { x: group.x + spread, y: group.y }));
        });
      }
    }
  }

  function render(): void {
    if (!overlay.isConnected) return;
    const nextPortal = currentPortal(document);
    if (nextPortal !== portal) {
      nextPortal.append(overlay);
      portal = nextPortal;
    }
    toggle.textContent = placing ? 'Saving comment…' : active ? 'Exit comment mode' : 'Add comment';
    toggle.setAttribute('aria-pressed', String(active));
    toggle.disabled = placing;
    toggle.setAttribute('aria-busy', String(placing));
    // A redraw rebuilds the crosshair button: keep keyboard focus on it.
    const crosshairFocused = Boolean(placeButton) && document.activeElement === placeButton;
    clearPins();
    capture = undefined;
    placeButton = undefined;
    if (active) {
      capture = document.createElement('div');
      capture.dataset.pyReviewCapture = '';
      capture.setAttribute('aria-hidden', 'true');
      const bounds = root.getBoundingClientRect();
      const captureOrigin = localPoint({ x: bounds.left, y: bounds.top });
      capture.style.left = `${captureOrigin.x}px`;
      capture.style.top = `${captureOrigin.y}px`;
      capture.style.width = `${bounds.width * (portal === document.body ? 1 : portal.clientWidth / (portal.getBoundingClientRect().width || 1))}px`;
      capture.style.height = `${bounds.height * (portal === document.body ? 1 : portal.clientHeight / (portal.getBoundingClientRect().height || 1))}px`;
      capture.addEventListener('pointerdown', (event) => event.stopPropagation());
      capture.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const element = elementAt(root, event.clientX, event.clientY, overlay);
        if (element) placeOn(element, { x: event.clientX, y: event.clientY });
      });
      overlay.append(capture);
      if (crosshair) {
        placeButton = document.createElement('button');
        placeButton.type = 'button';
        placeButton.dataset.pyReviewPlace = '';
        placeButton.textContent = placing ? '…' : '＋';
        placeButton.disabled = placing;
        placeButton.setAttribute('aria-label', 'Place pin here');
        placeButton.title = 'Place pin here. Move with arrow keys, then press Enter.';
        const local = localPoint(crosshair);
        placeButton.style.left = `${local.x}px`;
        placeButton.style.top = `${local.y}px`;
        placeButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const element = elementAt(root, crosshair?.x ?? 0, crosshair?.y ?? 0, overlay);
          if (element && crosshair) placeOn(element, crosshair);
        });
        overlay.append(placeButton);
        if (crosshairFocused) placeButton.focus();
      }
    }
    renderPins();
    reportOrphans();
  }

  async function placeOn(element: Element, point: { x: number; y: number }): Promise<void> {
    if (placing) return;
    const anchor = createAnchor(element, point, { root });
    placing = true;
    status.textContent = options.onCommentInClaude
      ? 'Opening Claude comment composer…'
      : 'Saving comment location…';
    render();
    try {
      if (options.onCommentInClaude) {
        await options.onCommentInClaude(element);
        status.textContent = 'Claude comment composer opened.';
      } else {
        await options.onPlace(anchor);
        status.textContent = 'Comment location saved.';
      }
      setActive(false);
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Could not save comment location.';
    } finally {
      placing = false;
      render();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      setActive(false);
      return;
    }
    if (isEditable(event.target)) return;
    if (
      (event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight') &&
      active &&
      crosshair
    ) {
      const step = event.shiftKey ? 40 : 16;
      if (event.key === 'ArrowUp') crosshair.y -= step;
      if (event.key === 'ArrowDown') crosshair.y += step;
      if (event.key === 'ArrowLeft') crosshair.x -= step;
      if (event.key === 'ArrowRight') crosshair.x += step;
      const bounds = root.getBoundingClientRect();
      crosshair.x = Math.max(bounds.left, Math.min(bounds.right, crosshair.x));
      crosshair.y = Math.max(bounds.top, Math.min(bounds.bottom, crosshair.y));
      event.preventDefault();
      render();
      placeButton?.focus();
      return;
    }
    if (event.key === 'Enter' && active && event.target === placeButton && crosshair) {
      event.preventDefault();
      const element = elementAt(root, crosshair.x, crosshair.y, overlay);
      if (element) void placeOn(element, crosshair);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 'c' && event.shiftKey) {
      const target =
        document.activeElement === placeButton ? lastFocusedElement : document.activeElement;
      if (target instanceof Element && root.contains(target)) {
        event.preventDefault();
        const rect = target.getBoundingClientRect();
        void placeOn(target, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      return;
    }
    if (event.key.toLowerCase() === 'c' && !event.shiftKey) {
      event.preventDefault();
      setActive(!active);
    }
  }

  document.addEventListener('keydown', onKeyDown);
  const inside = (event: Event) => event.composedPath().includes(overlay);
  const guardFocus = (event: FocusEvent) => {
    if (inside(event)) event.stopImmediatePropagation();
  };
  const stopBubble = (event: Event) => event.stopPropagation();
  const isolatedEvents = ['pointerdown', 'mousedown', 'touchstart', 'click', 'focusin'] as const;
  window.addEventListener('focusin', guardFocus, true);
  for (const type of isolatedEvents) overlay.addEventListener(type, stopBubble);
  window.addEventListener('resize', render);
  document.addEventListener('scroll', render, true);
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  render();

  return {
    setActive,
    setComments(next) {
      comments = [...next];
      render();
    },
    focusThread(threadId) {
      focusedThreadId = threadId;
      if (threadId) {
        const thread = comments.find(
          (comment) => comment.id === threadId && comment.id === comment.threadId
        );
        if (thread?.anchor) {
          const pins = resolvePins();
          const match = pins.find((pin) => pin.comment.threadId === threadId);
          if (match) {
            const group = clusterPins(pins).find((candidate) => candidate.pins.includes(match));
            if (group && group.pins.length > 1) {
              expandedClusters.add(
                group.pins
                  .map((pin) => pin.comment.threadId)
                  .sort()
                  .join(':')
              );
            }
          }
        }
      }
      render();
      if (threadId) {
        const pin = threadId
          ? comments.find((comment) => comment.id === threadId && comment.id === comment.threadId)
          : undefined;
        if (pin?.anchor) {
          const resolved = resolveAnchor(pin.anchor, root);
          if (!resolved.orphaned) {
            resolved.element.scrollIntoView?.({
              block: 'center',
              inline: 'center',
              behavior: 'smooth',
            });
            const focusPin = [
              ...overlay.querySelectorAll<HTMLButtonElement>('[data-py-review-pin]'),
            ].find((item) => item.dataset.threadId === threadId);
            focusPin?.focus();
          }
        }
      }
    },
    setShowResolved(show) {
      showResolved = show;
      render();
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('focusin', guardFocus, true);
      for (const type of isolatedEvents) overlay.removeEventListener(type, stopBubble);
      window.removeEventListener('resize', render);
      document.removeEventListener('scroll', render, true);
      window.removeEventListener('hashchange', render);
      window.removeEventListener('popstate', render);
      portalObserver?.disconnect();
      appObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect();
      overlay.remove();
    },
  };
}
