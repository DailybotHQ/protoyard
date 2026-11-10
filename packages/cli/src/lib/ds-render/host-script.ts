/**
 * The scripts `check ds --render` evaluates in a checked page's isolated
 * world (see `./browser.ts`); the built prototype itself is never changed.
 *
 * - Texuli's prebuilt ds-check host (`@texuli/tools`, `dist/ds-check/host.iife.js`,
 *   Texuli 0.17.0 and later): one framework-free IIFE that defines the
 *   `TexuliDsCheckHost` global. Read from the installed package once per
 *   process; nothing is bundled at run time.
 * - {@link INSTALL_HOST}: Protoyard's page reader. It lists the hash links,
 *   the visualizations outside every catalog root and the axis values each
 *   catalog root renders, then installs Texuli's host on the mount element,
 *   reading the catalog roots by `data-tx-component` only (a page cannot
 *   steer the color check with `data-ds-check-component` attributes of its
 *   own).
 *
 * `INSTALL_HOST` is plain JavaScript in a string: a TypeScript function would
 * be rewritten by the loader (tsx adds name helpers that do not exist in the
 * page), and its source is the CLI's own, never page data.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CliError } from '../output.ts';

/** The global Texuli's host IIFE defines (`var TexuliDsCheckHost=…`). */
export const DS_RENDER_HOST_GLOBAL = 'TexuliDsCheckHost';

/** The IIFE's file name beside `@texuli/tools/ds-check/host` (Texuli's `DS_CHECK_HOST_IIFE`). */
export const DS_RENDER_HOST_FILE = 'host.iife.js';

/** The catalog root attribute the host reads (Texuli's `DS_TX_COMPONENT_ATTRIBUTE`). */
export const DS_RENDER_COMPONENT_ATTRIBUTE = 'data-tx-component';

/** The most distinct axis sets (and distinct catalog ids) one page reports. */
export const DS_RENDER_MAX_AXES = 500;

/** The path of Texuli's host IIFE in the installed `@texuli/tools`. */
export function dsRenderHostPath(): string {
  let file: string;
  try {
    const host = createRequire(import.meta.url).resolve('@texuli/tools/ds-check/host');
    file = join(dirname(host), DS_RENDER_HOST_FILE);
  } catch {
    file = '';
  }
  if (!file || !existsSync(file))
    throw new CliError(
      'not_found',
      "Texuli's prebuilt ds-check host (@texuli/tools dist/ds-check/host.iife.js) is missing.",
      { hint: 'Reinstall @protoyard/cli; it needs @texuli/tools 0.17.0 or later.' }
    );
  return file;
}

let cached: string | undefined;

/** Texuli's host IIFE source, read once per process. */
export function dsRenderHostScript(): string {
  if (cached !== undefined) return cached;
  const text = readFileSync(dsRenderHostPath(), 'utf8');
  if (!text.includes(`${DS_RENDER_HOST_GLOBAL}=`))
    throw new CliError(
      'failure',
      `Texuli's ds-check host does not define ${DS_RENDER_HOST_GLOBAL}; @texuli/tools is not the version @protoyard/cli expects.`
    );
  cached = text;
  return cached;
}

/**
 * Reads the page and installs Texuli's host, in the isolated world:
 * `([scope, minVisualizationPx]) => DsRenderPageInfo`. Plain JavaScript,
 * `globalThis.TexuliDsCheckHost` must be defined first.
 */
export const INSTALL_HOST = `([selector, minVisualizationPx]) => {
  const ROOT = ${JSON.stringify(DS_RENDER_COMPONENT_ATTRIBUTE)};
  const AXES = ['variant', 'size', 'tone', 'density'];
  const MAX_AXES = ${DS_RENDER_MAX_AXES};
  const host = globalThis[${JSON.stringify(DS_RENDER_HOST_GLOBAL)}];
  if (!host || typeof host.installDsCheckHost !== 'function')
    throw new Error("Texuli's ds-check host is not loaded.");
  const selectorOf = (el) => {
    const parts = [];
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z_][\\w-]*$/.test(node.id)) {
        parts.unshift(tag + '#' + node.id);
        break;
      }
      const parent = node.parentElement;
      const same = parent ? [...parent.children].filter((c) => c.tagName === node.tagName) : [];
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : tag);
    }
    return parts.join('>');
  };
  const found = document.querySelector(selector);
  const scope = found || document.body;
  const unownedVisualizations = [];
  for (const el of scope.querySelectorAll('canvas, svg')) {
    const tag = el.tagName.toLowerCase();
    if (el.closest('[' + ROOT + ']')) continue;
    if (tag === 'svg' && el.parentElement && el.parentElement.closest('svg')) continue;
    const box = el.getBoundingClientRect();
    if (tag === 'svg' && Math.max(box.width, box.height) < minVisualizationPx) continue;
    unownedVisualizations.push({ selector: selectorOf(el), tag });
  }
  const axes = [];
  const seen = new Set();
  const components = [];
  const seenIds = new Set();
  const roots = scope.querySelectorAll('[' + ROOT + ']');
  for (const el of roots) {
    const id = el.getAttribute(ROOT) || '';
    if (!seenIds.has(id) && components.length < MAX_AXES) {
      seenIds.add(id);
      components.push({ component: id, selector: selectorOf(el) });
    }
  }
  for (const el of roots) {
    const entry = { component: el.getAttribute(ROOT) || '', selector: '' };
    let any = false;
    for (const axis of AXES) {
      const value = el.getAttribute('data-tx-' + axis);
      if (value) {
        entry[axis] = value;
        any = true;
      }
    }
    if (!any) continue;
    const key = JSON.stringify(entry);
    if (seen.has(key) || axes.length >= MAX_AXES) continue;
    seen.add(key);
    entry.selector = selectorOf(el);
    axes.push(entry);
  }
  const links = [
    ...new Set(
      [...scope.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => href.startsWith('#/'))
        .map((href) => href.slice(1).split('?')[0] || '')
    ),
  ];
  host.installDsCheckHost(scope, { componentAttribute: ROOT });
  return {
    scope: found ? selector : 'body',
    roots: roots.length,
    links,
    unownedVisualizations,
    axes,
    components,
  };
}`;
