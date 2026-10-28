import { createHash } from 'node:crypto';
import { escapeHtml } from '../review-index-html.ts';
import { safeRelativeUrl } from './compare-html.ts';

/**
 * `index.html` for the quick zone (`protoyard quick index`): one card per
 * exploration with links to it, its variants, its compare page and its
 * REVIEW.md. Like compare.html it is static and offline: every link is a
 * relative path inside the zone (checked by `safeRelativeUrl`), every string
 * from quick.json or a blueprint is escaped, it runs no script, and its
 * Content-Security-Policy allows only its own inline style (by hash).
 */

const KIND_LABELS = { deck: 'Deck', page: 'Page', doc: 'Document' } as const;

export interface QuickIndexLink {
  label: string;
  /** Relative URL inside the quick zone (`crm-idea/index.html`). */
  href: string;
}

export interface QuickIndexEntry {
  slug: string;
  /** The blueprint name, when it could be read. */
  name: string | null;
  /** Shown on the card for a deck, page or doc (default app). */
  kind?: 'app' | 'deck' | 'page' | 'doc';
  source: 'brief' | 'blueprint';
  updatedAt: string;
  open: string;
  variants: readonly QuickIndexLink[];
  compare: string | null;
  review: string | null;
  promotedTo: string | null;
}

const STYLE = `:root{--tx-background:#fafafa;--tx-foreground:#09090b;--tx-surface:#ffffff;--tx-muted:#f4f4f5;--tx-muted-foreground:#52525b;--tx-border:#e4e4e7;--tx-ring:#8b5cf6;--tx-primary:#7c3aed;--tx-radius:0.625rem;--tx-font-sans:"Inter Variable",Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--tx-background:#09090b;--tx-foreground:#fafafa;--tx-surface:#18181b;--tx-muted:#27272a;--tx-muted-foreground:#a1a1aa;--tx-border:rgb(255 255 255 / 0.1);--tx-ring:#a78bfa;--tx-primary:#a78bfa}}
*{box-sizing:border-box}
body{margin:0;background:var(--tx-background);color:var(--tx-foreground);font:16px/1.5 var(--tx-font-sans)}
main{margin:0 auto;padding:1.5rem 1rem 3rem;max-width:72rem}
h1{font-size:1.5rem;margin:0 0 .25rem}
h2{font-size:1rem;margin:0;overflow-wrap:anywhere}
p{margin:.25rem 0}
.lede,.meta{color:var(--tx-muted-foreground)}
ul.grid{list-style:none;margin:1.25rem 0 0;padding:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))}
article{background:var(--tx-surface);border:1px solid var(--tx-border);border-radius:var(--tx-radius);padding:.75rem;display:flex;flex-direction:column;gap:.5rem;height:100%}
.id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;padding:.125rem .5rem;border-radius:999px;background:var(--tx-muted);color:var(--tx-muted-foreground);overflow-wrap:anywhere}
ul.links{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem .75rem}
a{color:var(--tx-primary);text-underline-offset:2px;font-weight:600}
a:focus-visible{outline:2px solid var(--tx-ring);outline-offset:2px;border-radius:2px}
footer{margin-top:2rem}`;

const STYLE_HASH = createHash('sha256').update(STYLE).digest('base64');
export const QUICK_INDEX_CSP = `default-src 'none'; style-src 'sha256-${STYLE_HASH}'; base-uri 'none'; form-action 'none'`;

function link(href: string | null, label: string): string {
  const safe = href === null ? null : safeRelativeUrl(href);
  return safe ? `<li><a href="${escapeHtml(safe)}">${escapeHtml(label)}</a></li>` : '';
}

function renderEntry(entry: QuickIndexEntry): string {
  const title = entry.name ?? entry.slug;
  const links = [
    link(entry.open, 'Open'),
    ...entry.variants.map((variant) => link(variant.href, variant.label)),
    link(entry.compare, 'Compare variants'),
    link(entry.review, 'REVIEW.md'),
  ].join('');
  const promoted = entry.promotedTo
    ? `<p class="meta">Promoted to prototypes/${escapeHtml(entry.promotedTo)}</p>`
    : '';
  return `<li><article><h2>${escapeHtml(title)}</h2><p><span class="id">${escapeHtml(entry.slug)}</span></p><p class="meta">${entry.kind && entry.kind !== 'app' ? `${KIND_LABELS[entry.kind]} · ` : ''}From a ${entry.source === 'brief' ? 'brief' : 'blueprint'} · updated ${escapeHtml(entry.updatedAt)}</p>${promoted}<ul class="links">${links}</ul></article></li>`;
}

/** Renders the page. Deterministic: no clock, no randomness, no environment. */
export function renderQuickIndex(entries: readonly QuickIndexEntry[]): string {
  const count = entries.length;
  const body =
    count === 0
      ? '<p>No explorations yet. Create one with <code>protoyard quick "&lt;brief&gt;"</code>.</p>'
      : `<ul class="grid">\n${entries.map(renderEntry).join('\n')}\n</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(QUICK_INDEX_CSP)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>Quick explorations</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Quick explorations</h1>
<p class="lede">${count} exploration${count === 1 ? '' : 's'} in this folder. Each one keeps its own simulated data in the browser that opens it.</p>
${body}
<footer class="meta"><p>Simulated data only. Generated by <code>protoyard quick index</code>; this page runs no script and loads nothing from the network.</p></footer>
</main>
</body>
</html>
`;
}
