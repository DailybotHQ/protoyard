/**
 * The team review index: one static, dependency-free HTML page (no script)
 * that links every published prototype with its scenario and persona deep
 * links. Pure functions: the same model always renders the same bytes. All
 * text is escaped; URLs come only from the deploy ledger (provider-printed)
 * and are rebuilt with the URL API, never concatenated.
 */

export const REVIEW_FORMAT = 'protoyard.review-index';

export interface ReviewDeployment {
  url: string;
  target: 'preview' | 'production';
  branch: string | null;
  provider: string;
  /** When the publish completed (from the ledger). */
  at: string;
  commit: string | null;
  dirty: boolean | null;
}

export interface ReviewLink {
  id: string;
  label: string;
  url: string;
}

export interface ReviewEntry {
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  deployment: ReviewDeployment | null;
  scenarioLinks: ReviewLink[];
  personaLinks: ReviewLink[];
  /** Shown when there is no real deployment: the command that would create one. */
  publishCommand: string;
}

export interface ReviewModel {
  format: typeof REVIEW_FORMAT;
  formatVersion: 1;
  title: string;
  /** Public base of the review site, used for links to its own files. */
  base: string;
  entries: ReviewEntry[];
}

const SCENARIO_ID = /^[a-z][a-z0-9-]*$/;
/** Same rule as parseScenarioLink in @protoyard/core: other actor ids are ignored. */
const ACTOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `url` with one query parameter set (keeps the path and any #route). */
export function withParam(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

export function scenarioLinks(url: string, scenarios: readonly string[]): ReviewLink[] {
  return scenarios
    .filter((id) => SCENARIO_ID.test(id))
    .map((id) => ({ id, label: id, url: withParam(url, 'scenario', id) }));
}

export function personaLinks(
  url: string,
  personas: readonly { id: string; name: string; role: string | null }[]
): ReviewLink[] {
  return personas
    .filter((p) => ACTOR_ID.test(p.id))
    .map((p) => ({
      id: p.id,
      label: p.role ? `${p.name} (${p.role})` : p.name,
      url: withParam(url, 'actor', p.id),
    }));
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) URLs may become links; anything else renders as text. */
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? escapeHtml(parsed.toString())
      : null;
  } catch {
    return null;
  }
}

function link(url: string, label: string): string {
  const href = safeHref(url);
  return href ? `<a href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label);
}

/** Tokens copied from @protoyard/themes base.css (Violet, light and dark). */
const STYLE = `:root{--py-background:#fafafa;--py-foreground:#09090b;--py-surface:#ffffff;--py-muted:#f4f4f5;--py-muted-foreground:#52525b;--py-border:#e4e4e7;--py-ring:#8b5cf6;--py-primary:#7c3aed;--py-primary-foreground:#ffffff;--py-radius:0.625rem;--py-font-sans:"Inter Variable",Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--py-background:#09090b;--py-foreground:#fafafa;--py-surface:#18181b;--py-muted:#27272a;--py-muted-foreground:#a1a1aa;--py-border:rgb(255 255 255 / 0.1);--py-ring:#a78bfa;--py-primary:#a78bfa;--py-primary-foreground:#2e1065}}
*{box-sizing:border-box}
body{margin:0;background:var(--py-background);color:var(--py-foreground);font:16px/1.5 var(--py-font-sans)}
main{max-width:64rem;margin:0 auto;padding:2rem 1rem 4rem}
h1{font-size:1.75rem;margin:0 0 .25rem}
h2{font-size:1.25rem;margin:0}
h3{font-size:.875rem;margin:1rem 0 .25rem;color:var(--py-muted-foreground);font-weight:600}
p{margin:.25rem 0}
.lede,.meta{color:var(--py-muted-foreground)}
.meta{font-size:.875rem}
ul.cards{list-style:none;margin:1.5rem 0 0;padding:0;display:grid;gap:1rem}
article{background:var(--py-surface);border:1px solid var(--py-border);border-radius:var(--py-radius);padding:1.25rem}
.head{display:flex;gap:.75rem;align-items:baseline;flex-wrap:wrap}
.badge{font-size:.75rem;padding:.125rem .5rem;border-radius:999px;background:var(--py-muted);color:var(--py-muted-foreground)}
.badge.live{background:var(--py-primary);color:var(--py-primary-foreground)}
ul.links{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}
a{color:var(--py-primary);text-underline-offset:2px}
a:focus-visible{outline:2px solid var(--py-ring);outline-offset:2px;border-radius:2px}
.open{margin-top:.75rem;font-weight:600}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875rem;background:var(--py-muted);padding:.125rem .375rem;border-radius:.25rem;overflow-wrap:anywhere}
footer{margin-top:2rem}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

function linkList(heading: string, links: readonly ReviewLink[]): string {
  if (links.length === 0) return '';
  const items = links.map((l) => `<li>${link(l.url, l.label)}</li>`).join('');
  return `<h3>${escapeHtml(heading)}</h3><ul class="links">${items}</ul>`;
}

function renderEntry(entry: ReviewEntry): string {
  const icon = entry.icon ? `<span aria-hidden="true">${escapeHtml(entry.icon)}</span> ` : '';
  const d = entry.deployment;
  const status = d
    ? `<span class="badge live">${escapeHtml(d.target === 'production' ? 'production' : `preview${d.branch ? ` · ${d.branch}` : ''}`)}</span>`
    : '<span class="badge">not deployed</span>';
  const body = d
    ? [
        `<p class="meta">Published ${escapeHtml(d.at)} via ${escapeHtml(d.provider)}${
          d.commit
            ? ` from commit <code>${escapeHtml(d.commit.slice(0, 12))}</code>${d.dirty ? ' (uncommitted changes)' : ''}`
            : ''
        }</p>`,
        `<p class="open">${link(d.url, `Open ${entry.name}`)}</p>`,
        linkList('Scenarios', entry.scenarioLinks),
        linkList('Personas', entry.personaLinks),
      ].join('')
    : `<p class="meta">No real deployment is recorded for this prototype. Publish it with <code>${escapeHtml(entry.publishCommand)}</code>, then regenerate this page.</p>`;
  return `<li><article aria-labelledby="p-${escapeHtml(entry.slug)}"><div class="head"><h2 id="p-${escapeHtml(entry.slug)}">${icon}${escapeHtml(entry.name)}</h2>${status}</div><p>${escapeHtml(entry.description)}</p>${body}</article></li>`;
}

/** Renders the whole page. Deterministic: no clock, no randomness, no environment. */
export function renderReviewIndex(model: ReviewModel): string {
  const deployed = model.entries.filter((e) => e.deployment).length;
  const cards = model.entries.map(renderEntry).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(model.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(model.title)}</h1>
<p class="lede">${deployed} of ${model.entries.length} prototypes deployed. Each prototype keeps its data in the visitor's own browser: nothing is shared between reviewers.</p>
<ul class="cards">
${cards}
</ul>
<footer class="meta"><p>Simulated data only. Generated by <code>protoyard review-index</code> from the local deploy ledger; links are the URLs the hosting provider reported. Machine-readable: <a href="${escapeHtml(model.base)}review-manifest.json">review-manifest.json</a>.</p></footer>
</main>
</body>
</html>
`;
}
