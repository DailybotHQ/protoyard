import {
  type ReviewAnchor,
  ReviewAnchorSchema,
  type ReviewContext,
  ReviewContextSchema,
  type ReviewLocatorKind,
} from '@protoyard/core/review';
import { findAll, fingerprintOf, type Locator, locatorsFor } from './locators.ts';

export interface CreateAnchorOptions {
  /** The element locators are relative to (the prototype's mount point). Default: `document.body`. */
  root?: Element;
  /** Route pattern and path. Default: the hash route (`#/deals/7` → `/deals/7`) as both. */
  route?: { pattern: string; path: string };
}

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);

function currentRoute(): { pattern: string; path: string } {
  const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '');
  const path = hash.startsWith('/') ? hash.split('?')[0] || '/' : '/';
  return { pattern: path, path };
}

/**
 * An anchor for a click at `point` (client coordinates) on `element`. The
 * offset is relative to the element's box from `getBoundingClientRect`,
 * which includes any scale transform (such as a device frame), so it holds at
 * any zoom.
 */
export function createAnchor(
  element: Element,
  point: { x: number; y: number },
  options: CreateAnchorOptions = {}
): ReviewAnchor {
  const root = options.root ?? element.ownerDocument.body;
  const rect = element.getBoundingClientRect();
  const offset = {
    x: rect.width > 0 ? clamp((point.x - rect.left) / rect.width) : 0.5,
    y: rect.height > 0 ? clamp((point.y - rect.top) / rect.height) : 0.5,
  };
  const fingerprint = fingerprintOf(element);
  return ReviewAnchorSchema.parse({
    route: options.route ?? currentRoute(),
    locators: locatorsFor(element, root),
    ...(fingerprint ? { fingerprint } : {}),
    offset,
  });
}

/** How much each locator kind is trusted when it matches. */
export const LOCATOR_CONFIDENCE: Record<ReviewLocatorKind, number> = {
  'py-anchor': 1,
  'test-id': 0.95,
  id: 0.9,
  'role-path': 0.8,
  'css-path': 0.6,
};

/** Below this, show the pin dashed: it may be on the wrong element. */
export const LOW_CONFIDENCE = 0.7;

export type ResolvedAnchor =
  | {
      orphaned: false;
      element: Element;
      confidence: number;
      locator: Locator;
      fingerprintMatches: boolean | null;
    }
  | { orphaned: true; element: null; confidence: 0 };

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Finds an anchor's element under `root`, trying its locators strongest
 * first. A match whose text differs from the fingerprint keeps looking down
 * the ladder; if nothing matches the text, the best candidate is returned at
 * half confidence. No element at all is `orphaned`.
 */
export function resolveAnchor(
  anchor: Pick<ReviewAnchor, 'locators' | 'fingerprint'>,
  root: Element
): ResolvedAnchor {
  const expected = anchor.fingerprint ? normalize(anchor.fingerprint) : null;
  let fallback: Extract<ResolvedAnchor, { orphaned: false }> | null = null;
  for (const locator of anchor.locators) {
    const matches = findAll(locator, root);
    if (matches.length === 0) continue;
    const base = LOCATOR_CONFIDENCE[locator.kind] * (matches.length > 1 ? 0.9 : 1);
    if (expected === null)
      return {
        orphaned: false,
        element: matches[0] as Element,
        confidence: base,
        locator,
        fingerprintMatches: null,
      };
    const same = matches.find((el) => normalize(fingerprintOf(el)) === expected);
    if (same)
      return {
        orphaned: false,
        element: same,
        confidence: base,
        locator,
        fingerprintMatches: true,
      };
    fallback ??= {
      orphaned: false,
      element: matches[0] as Element,
      confidence: base * 0.5,
      locator,
      fingerprintMatches: false,
    };
  }
  return fallback ?? { orphaned: true, element: null, confidence: 0 };
}

/** Where to draw the pin for a resolved anchor, in client coordinates. */
export function anchorPoint(
  anchor: Pick<ReviewAnchor, 'offset'>,
  element: Element
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + anchor.offset.x * rect.width,
    y: rect.top + anchor.offset.y * rect.height,
  };
}

/** True when the anchor belongs to `path` (its exact path, or its pattern with `:param` segments). */
export function anchorMatchesRoute(anchor: Pick<ReviewAnchor, 'route'>, path: string): boolean {
  if (anchor.route.path === path) return true;
  const pattern = anchor.route.pattern.split('/');
  const parts = path.split('/');
  return (
    pattern.length === parts.length &&
    pattern.every((seg, i) => (seg.startsWith(':') ? (parts[i] ?? '') !== '' : seg === parts[i]))
  );
}

export type ReviewContextInput = Partial<Omit<ReviewContext, 'viewport'>> & {
  viewport?: ReviewContext['viewport'];
};

/**
 * What the reviewer is looking at: scenario, persona, shell, orientation,
 * theme, mode, layout, viewport and build id. Pass the values from the
 * runtime and shell; the viewport defaults to the window size. Missing
 * values are left out, and invalid ones throw (zod).
 */
export function captureContext(input: ReviewContextInput = {}): ReviewContext {
  const viewport = input.viewport ?? {
    width: Math.max(1, Math.round(typeof window === 'undefined' ? 1 : window.innerWidth)),
    height: Math.max(1, Math.round(typeof window === 'undefined' ? 1 : window.innerHeight)),
  };
  const defined = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  return ReviewContextSchema.parse({ ...defined, viewport });
}
