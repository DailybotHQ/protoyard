/**
 * The scripts `check ds --render` evaluates in a checked page's isolated
 * world (see `./browser.ts`); the built prototype itself is never changed.
 *
 * - Texuli's prebuilt ds-check host (the `@texuli/tools/ds-check/host.iife.js`
 *   package export, Texuli 0.17.1 and later): one framework-free IIFE that
 *   defines the `TexuliDsCheckHost` global. Read from the installed package
 *   once per process; nothing is bundled at run time.
 * - {@link INSTALL_HOST}: Protoyard's page reader. It lists the hash links,
 *   the visualizations outside every catalog root and the axis values each
 *   catalog root renders, then installs Texuli's host on the mount element.
 *   The host's root attribute is the caller's choice; Protoyard passes
 *   `data-tx-component` itself, so a page cannot steer the color check with
 *   `data-ds-check-component` attributes of its own.
 *
 * The page is then mapped by Texuli's `mapLockedRenderPage` in the same
 * world, which hands the host's `map` the allow set and the composed child →
 * parent map (see `renderAllowManifest`; Texuli 0.17.2 forwards both).
 *
 * The scripts are plain JavaScript in strings: a TypeScript function would
 * be rewritten by the loader (tsx adds name helpers that do not exist in the
 * page), and their source is the CLI's own, never page data.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CliError } from '../output.ts';

/** The global Texuli's host IIFE defines (`var TexuliDsCheckHost=…`). */
export const DS_RENDER_HOST_GLOBAL = 'TexuliDsCheckHost';

/** The package export of Texuli's host IIFE (`@texuli/tools` 0.17.1 and later). */
export const DS_RENDER_HOST_EXPORT = '@texuli/tools/ds-check/host.iife.js';

/** The global the installed host exposes (Texuli's `DS_CHECK_GLOBAL`). */
export const DS_RENDER_CHECK_GLOBAL = 'texuliDsCheck';

/** The catalog root attribute the host reads (Texuli's `DS_TX_COMPONENT_ATTRIBUTE`). */
export const DS_RENDER_COMPONENT_ATTRIBUTE = 'data-tx-component';

/** The most distinct catalog ids one page reports. */
export const DS_RENDER_MAX_AXES = 500;

/** The path of Texuli's host IIFE in the installed `@texuli/tools`. */
export function dsRenderHostPath(): string {
  let file: string;
  try {
    file = createRequire(import.meta.url).resolve(DS_RENDER_HOST_EXPORT);
  } catch {
    file = '';
  }
  if (!file || !existsSync(file))
    throw new CliError(
      'not_found',
      `Texuli's prebuilt ds-check host (${DS_RENDER_HOST_EXPORT}) is missing.`,
      { hint: 'Reinstall @protoyard/cli; it needs @texuli/tools 0.17.1 or later.' }
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
  const links = [
    ...new Set(
      [...scope.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => href.startsWith('#/'))
        .map((href) => href.slice(1).split('?')[0] || '')
    ),
  ];
  // The caller chooses the root attribute (Texuli 0.17.1); pass it anyway.
  host.installDsCheckHost(scope, { componentAttribute: ROOT });
  return {
    scope: found ? selector : 'body',
    roots: roots.length,
    links,
    unownedVisualizations,
    components,
  };
}`;
