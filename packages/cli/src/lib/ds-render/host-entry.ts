/**
 * Browser entry of `protoyard check ds --render` (bundled once per run by
 * `./host-bundle.ts`, injected into a built prototype's page by Playwright;
 * never imported by the CLI process). It installs Texuli's ds-check host on
 * the prototype's mount element so `runLockedRenderChecks` can apply,
 * inspect and map it, after copying each catalog root's
 * `data-tx-component` to `data-ds-check-component` (the attribute the host's
 * `inspect` reads). It also lists the visualizations (`canvas`, large `svg`)
 * that sit outside every catalog root (a chart, map or canvas is exempt from
 * the per-pixel check only when it is a catalog component), and the axis
 * values each catalog root renders (`data-tx-variant`, `-size`, `-tone`,
 * `-density`), which the CLI checks against the allow section.
 */
import { installDsCheckHost } from '@texuli/tools/ds-check/host';

const ROOT = 'data-tx-component';
const CHECK = 'data-ds-check-component';

export interface DsRenderPageInfo {
  /** The scope selector that matched (`#app`, or `body` as a fallback). */
  scope: string;
  /** Catalog roots painted inside the scope (`data-tx-component`). */
  roots: number;
  /** Hash links (`#/...`) inside the scope, for parameterized routes. */
  links: string[];
  /** `canvas` and large `svg` elements with no catalog root around them. */
  unownedVisualizations: { selector: string; tag: string }[];
  /** Catalog roots with axis values (`data-tx-variant`, `-size`, `-tone`, `-density`), one per distinct value set. */
  axes: RenderedAxes[];
}

export interface RenderedAxes {
  component: string;
  selector: string;
  variant?: string;
  size?: string;
  tone?: string;
  density?: string;
}

const AXES = ['variant', 'size', 'tone', 'density'] as const;
/** The most distinct axis sets one page reports. */
const MAX_AXES = 500;

function selectorOf(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const tag = node.tagName.toLowerCase();
    if (node.id && /^[A-Za-z_][\w-]*$/.test(node.id)) {
      parts.unshift(`${tag}#${node.id}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    const same = parent ? [...parent.children].filter((c) => c.tagName === node?.tagName) : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
  }
  return parts.join('>');
}

/** Install the host; idempotent per page load. */
export function install(selector: string, minVisualizationPx: number): DsRenderPageInfo {
  const found = document.querySelector<HTMLElement>(selector);
  const scope = found ?? document.body;
  for (const el of scope.querySelectorAll(`[${ROOT}]`)) {
    el.setAttribute(CHECK, el.getAttribute(ROOT) ?? '');
  }
  const unownedVisualizations: DsRenderPageInfo['unownedVisualizations'] = [];
  for (const el of scope.querySelectorAll('canvas, svg')) {
    if (el.closest(`[${ROOT}]`)) continue;
    if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg')) continue;
    const box = el.getBoundingClientRect();
    if (el.tagName.toLowerCase() === 'svg' && Math.max(box.width, box.height) < minVisualizationPx)
      continue;
    unownedVisualizations.push({ selector: selectorOf(el), tag: el.tagName.toLowerCase() });
  }
  const axes: RenderedAxes[] = [];
  const seenAxes = new Set<string>();
  for (const el of scope.querySelectorAll(`[${ROOT}]`)) {
    const entry: RenderedAxes = { component: el.getAttribute(ROOT) ?? '', selector: '' };
    let any = false;
    for (const axis of AXES) {
      const value = el.getAttribute(`data-tx-${axis}`);
      if (value) {
        entry[axis] = value;
        any = true;
      }
    }
    if (!any) continue;
    const key = JSON.stringify(entry);
    if (seenAxes.has(key) || axes.length >= MAX_AXES) continue;
    seenAxes.add(key);
    entry.selector = selectorOf(el);
    axes.push(entry);
  }
  const links = [
    ...new Set(
      [...scope.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href.startsWith('#/'))
        .map((href) => href.slice(1).split('?')[0] ?? '')
    ),
  ];
  installDsCheckHost(scope);
  return {
    scope: found ? selector : 'body',
    roots: scope.querySelectorAll(`[${ROOT}]`).length,
    links,
    unownedVisualizations,
    axes,
  };
}
