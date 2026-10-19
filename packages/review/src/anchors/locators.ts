import type { ReviewLocatorKind } from '@protoyard/core/review';

export interface Locator {
  kind: ReviewLocatorKind;
  value: string;
}

/** The documented opt-in attribute: `data-py-anchor="deal-card-total"` marks a stable review target. */
export const PY_ANCHOR_ATTRIBUTE = 'data-py-anchor';

const MAX = 500;
const NAME_MAX = 60;

/**
 * Ids that change between renders or builds, so they never become locators:
 * Bits UI (`bits-…`), digits only, UUID or long hash-like ids, React `:r1:`,
 * and any id with a counter segment such as Svelte `$props.id()` output
 * (`c1`, `s12`) inside `grid-c1-err`.
 */
export function isGeneratedId(id: string): boolean {
  if (!id || /^bits-/i.test(id) || /^\d+$/.test(id) || /^:r[\da-z]*:$/i.test(id)) return true;
  if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) return true;
  if (/^[\da-z]{12,}$/i.test(id) && /\d/.test(id) && /[a-z]/i.test(id)) return true;
  return id.split(/[-_:]/).some((part) => /^[a-z]{0,2}\d+$/i.test(part));
}

const LANDMARKS = new Set([
  'main',
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'region',
  'form',
  'search',
  'dialog',
]);

/** The element's role: explicit `role`, else the implicit one for common tags ('' when generic). */
export function roleOf(el: Element): string {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : '';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return (
      (
        {
          checkbox: 'checkbox',
          radio: 'radio',
          range: 'slider',
          button: 'button',
          submit: 'button',
          number: 'spinbutton',
          search: 'searchbox',
        } as Record<string, string>
      )[type] ?? 'textbox'
    );
  }
  if ((tag === 'section' || tag === 'form') && !accessibleName(el, false)) return '';
  const implicit: Record<string, string> = {
    button: 'button',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    section: 'region',
    form: 'form',
    img: 'img',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    table: 'table',
    tr: 'row',
    td: 'cell',
    th: 'columnheader',
    select: 'combobox',
    textarea: 'textbox',
    dialog: 'dialog',
    article: 'article',
    summary: 'button',
  };
  return implicit[tag] ?? '';
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** A short accessible name: aria-label, aria-labelledby, alt, a `<label>`, then (optionally) the text. */
export function accessibleName(el: Element, useText = true): string {
  const label = clean(el.getAttribute('aria-label'));
  if (label) return label.slice(0, NAME_MAX);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const text = clean(
      by
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id)?.textContent)
        .join(' ')
    );
    if (text) return text.slice(0, NAME_MAX);
  }
  const alt = clean(el.getAttribute('alt'));
  if (alt) return alt.slice(0, NAME_MAX);
  const id = el.getAttribute('id');
  if (id && /^(input|select|textarea)$/i.test(el.tagName)) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (forLabel) return clean(forLabel.textContent).slice(0, NAME_MAX);
  }
  const wrapping = el.closest('label');
  if (wrapping && wrapping !== el && /^(input|select|textarea)$/i.test(el.tagName))
    return clean(wrapping.textContent).slice(0, NAME_MAX);
  return useText ? spacedText(el).slice(0, NAME_MAX) : '';
}

/** The element's text nodes joined by spaces (textContent runs block texts together). */
function spacedText(el: Element): string {
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    parts.push(node.nodeValue ?? '');
  return clean(parts.join(' '));
}

/** Short visible text used to check that a located element is still the same one. */
export function fingerprintOf(el: Element): string {
  return (spacedText(el) || accessibleName(el)).slice(0, 120);
}

interface RolePath {
  landmark: { role: string; name: string } | null;
  role: string;
  name: string;
  index: number;
}

function nearestLandmark(el: Element, root: Element): Element | null {
  for (
    let node = el.parentElement;
    node && node !== root.parentElement;
    node = node.parentElement
  ) {
    if (LANDMARKS.has(roleOf(node))) return node;
    if (node === root) break;
  }
  return null;
}

function byRole(scope: Element, role: string, name: string): Element[] {
  return [...scope.querySelectorAll('*')].filter(
    (el) => roleOf(el) === role && accessibleName(el) === name
  );
}

function landmarks(root: Element, landmark: RolePath['landmark']): Element[] {
  if (!landmark) return [root];
  const all = [root, ...root.querySelectorAll('*')];
  return all.filter(
    (el) => roleOf(el) === landmark.role && accessibleName(el, false) === landmark.name
  );
}

function rolePath(el: Element, root: Element): string | null {
  const role = roleOf(el);
  const name = accessibleName(el);
  if (!role || !name) return null;
  const mark = nearestLandmark(el, root);
  const scope = mark ?? root;
  const index = byRole(scope, role, name).indexOf(el);
  if (index < 0) return null;
  const path: RolePath = {
    landmark: mark ? { role: roleOf(mark), name: accessibleName(mark, false) } : null,
    role,
    name,
    index,
  };
  return JSON.stringify(path);
}

function cssPath(el: Element, root: Element): string | null {
  const steps: string[] = [];
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const id = node.getAttribute('id');
    if (id && !isGeneratedId(id)) {
      steps.unshift(`#${CSS.escape(id)}`);
      return steps.join(' > ');
    }
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    const tag = node.tagName.toLowerCase();
    const same = [...parent.children].filter((c) => c.tagName === node?.tagName);
    steps.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
  }
  return steps.length ? `:scope > ${steps.join(' > ')}` : null;
}

/** The locator ladder for `el`, strongest first (at most one of each kind). */
export function locatorsFor(el: Element, root: Element): Locator[] {
  const out: Locator[] = [];
  const push = (kind: ReviewLocatorKind, value: string | null | undefined) => {
    if (value && value.length <= MAX) out.push({ kind, value });
  };
  push('py-anchor', el.getAttribute(PY_ANCHOR_ATTRIBUTE)?.trim());
  push('test-id', el.getAttribute('data-testid')?.trim());
  const id = el.getAttribute('id');
  if (id && !isGeneratedId(id)) push('id', id);
  push('role-path', rolePath(el, root));
  push('css-path', cssPath(el, root));
  return out;
}

const attr = (name: string, value: string) => `[${name}="${CSS.escape(value)}"]`;

/** Every element a locator matches inside `root` (in document order). */
export function findAll(locator: Locator, root: Element): Element[] {
  try {
    switch (locator.kind) {
      case 'py-anchor':
        return [...root.querySelectorAll(attr(PY_ANCHOR_ATTRIBUTE, locator.value))];
      case 'test-id':
        return [...root.querySelectorAll(attr('data-testid', locator.value))];
      case 'id': {
        const found = root.ownerDocument.getElementById(locator.value);
        return found && root.contains(found) ? [found] : [];
      }
      case 'role-path': {
        const path = JSON.parse(locator.value) as RolePath;
        for (const scope of landmarks(root, path.landmark)) {
          const match = byRole(scope, path.role, path.name)[path.index];
          if (match) return [match];
        }
        return [];
      }
      case 'css-path': {
        // A path from a stable id starts at that id; otherwise it starts at the root.
        const scope = locator.value.startsWith('#') ? root.ownerDocument : root;
        const found = scope.querySelector(locator.value);
        return found && root.contains(found) ? [found] : [];
      }
    }
  } catch {
    // A malformed locator (old data, bad JSON or selector) matches nothing.
  }
  return [];
}
