import { createHash } from 'node:crypto';
import { escapeHtml } from '../review-index-html.ts';
import type { QuickRecord } from './model.ts';

/**
 * `compare.html` for an exploration with variants: every variant side by side
 * (live iframes in a grid on wide screens, one column on phones, where a
 * screenshot replaces the iframe when there is one), each with its label and
 * an "Open" link. The page is static and offline: every link and image is a
 * relative path inside the exploration folder, all text is escaped, it runs
 * no script, and its Content-Security-Policy allows only its own inline style
 * (by hash), same-origin images and same-origin frames.
 */

export interface CompareScreenshot {
  /** Relative path to a PNG inside the exploration folder. */
  path: string;
  width: number;
  height: number;
}

export interface CompareVariant {
  id: string;
  label: string;
  /** Relative URL that opens this variant (`v1/`, `v1/index.html#/bookings`). */
  href: string;
  screenshot: CompareScreenshot | null;
}

export interface CompareModel {
  /** Page heading, usually the blueprint name. */
  title: string;
  /** The brief, when it was stored (plain text). */
  brief: string | null;
  variants: readonly CompareVariant[];
}

/**
 * A relative URL that stays on this site: no scheme, no `//` host, no
 * backslashes or control characters, and no `..` segment in its path.
 * Anything else is refused, so a hostile record cannot point a frame or a
 * link elsewhere.
 */
export function safeRelativeUrl(url: string): string | null {
  if (url.length === 0 || url.length > 512) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point.
  if (/[\u0000-\u001f\u007f\\\s]/.test(url)) return null;
  if (url.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) return null;
  const path = url.split(/[?#]/)[0] ?? '';
  if (path.split('/').some((segment) => segment === '..')) return null;
  return url;
}

const STYLE = `:root{--py-background:#fafafa;--py-foreground:#09090b;--py-surface:#ffffff;--py-muted:#f4f4f5;--py-muted-foreground:#52525b;--py-border:#e4e4e7;--py-ring:#8b5cf6;--py-primary:#7c3aed;--py-radius:0.625rem;--py-font-sans:"Inter Variable",Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--py-background:#09090b;--py-foreground:#fafafa;--py-surface:#18181b;--py-muted:#27272a;--py-muted-foreground:#a1a1aa;--py-border:rgb(255 255 255 / 0.1);--py-ring:#a78bfa;--py-primary:#a78bfa}}
*{box-sizing:border-box}
body{margin:0;background:var(--py-background);color:var(--py-foreground);font:16px/1.5 var(--py-font-sans)}
main{margin:0 auto;padding:1.5rem 1rem 3rem;max-width:120rem}
h1{font-size:1.5rem;margin:0 0 .25rem}
h2{font-size:1rem;margin:0}
p{margin:.25rem 0}
.lede,.meta{color:var(--py-muted-foreground)}
.brief{max-width:60rem;white-space:pre-wrap;overflow-wrap:anywhere}
ul.grid{list-style:none;margin:1.25rem 0 0;padding:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr))}
article{background:var(--py-surface);border:1px solid var(--py-border);border-radius:var(--py-radius);padding:.75rem;display:flex;flex-direction:column;gap:.5rem;height:100%}
.head{display:flex;gap:.5rem;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
.id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;padding:.125rem .5rem;border-radius:999px;background:var(--py-muted);color:var(--py-muted-foreground)}
iframe{width:100%;height:36rem;border:1px solid var(--py-border);border-radius:calc(var(--py-radius) - .25rem);background:var(--py-background)}
img{width:100%;height:auto;border:1px solid var(--py-border);border-radius:calc(var(--py-radius) - .25rem)}
.shot{display:none}
a{color:var(--py-primary);text-underline-offset:2px;font-weight:600}
a:focus-visible{outline:2px solid var(--py-ring);outline-offset:2px;border-radius:2px}
footer{margin-top:2rem}
@media (max-width:48rem){.has-shot iframe{display:none}.has-shot .shot{display:block}iframe{height:28rem}}`;

const STYLE_HASH = createHash('sha256').update(STYLE).digest('base64');
export const COMPARE_CSP = `default-src 'none'; style-src 'sha256-${STYLE_HASH}'; img-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'`;

function renderVariant(variant: CompareVariant): string {
  const id = /^v[1-8]$/.test(variant.id) ? variant.id : 'v';
  const label = escapeHtml(variant.label);
  const href = safeRelativeUrl(variant.href);
  const shotPath = variant.screenshot ? safeRelativeUrl(variant.screenshot.path) : null;
  const shot =
    variant.screenshot && shotPath && /\.png$/i.test(shotPath.split(/[?#]/)[0] ?? '')
      ? `<img class="shot" src="${escapeHtml(shotPath)}" width="${Math.trunc(variant.screenshot.width)}" height="${Math.trunc(variant.screenshot.height)}" alt="Screenshot of ${label}" loading="lazy">`
      : '';
  const frame = href
    ? `<iframe src="${escapeHtml(href)}" title="${label}" loading="lazy" referrerpolicy="no-referrer"></iframe>`
    : '<p class="meta">This variant has no valid link.</p>';
  const open = href ? `<a href="${escapeHtml(href)}">Open ${escapeHtml(id)}</a>` : '';
  return `<li><article class="${shot ? 'has-shot' : ''}" aria-labelledby="${id}-label"><div class="head"><h2 id="${id}-label">${label}</h2><span class="id">${escapeHtml(id)}</span></div>${frame}${shot}<p>${open}</p></article></li>`;
}

/** Renders the whole page. Deterministic: no clock, no randomness, no environment. */
export function renderComparePage(model: CompareModel): string {
  const count = model.variants.length;
  const brief = model.brief ? `<p class="brief">${escapeHtml(model.brief)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(COMPARE_CSP)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(`Compare: ${model.title}`)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(model.title)}</h1>
<p class="lede">${count} variant${count === 1 ? '' : 's'} of one idea, side by side. Each variant keeps its own simulated data in this browser.</p>
${brief}
<ul class="grid">
${model.variants.map(renderVariant).join('\n')}
</ul>
<footer class="meta"><p>Simulated data only. Generated by <code>protoyard quick</code>; this page runs no script and loads nothing from the network.</p></footer>
</main>
</body>
</html>
`;
}

/**
 * The compare model for a recorded exploration: its variants in order, each
 * with the first screenshot recorded for it. `hrefFor` maps a variant to the
 * relative URL that opens it (the player layout decides that).
 */
export function compareModelFromRecord(
  record: QuickRecord,
  title: string,
  hrefFor: (variant: QuickRecord['variants'][number]) => string
): CompareModel {
  return {
    title,
    brief: record.brief?.text ?? null,
    variants: record.variants.map((variant) => {
      const shot = record.screenshots.files.find((file) => file.variant === variant.id);
      return {
        id: variant.id,
        label: variant.label,
        href: hrefFor(variant),
        screenshot: shot ? { path: shot.path, width: shot.width, height: shot.height } : null,
      };
    }),
  };
}
