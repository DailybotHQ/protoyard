/**
 * `pnpm exec tsx scripts/check-public-docs.ts` — validate the public guides
 * the gallery publishes at /docs/, and optionally a built site.
 *
 * Always:
 * - every guide in PUBLIC_GUIDES has its source in docs/;
 * - every link in every rendered public guide resolves: a /docs/<slug>/ link
 *   to a public guide (and its #anchor to a real heading), an in-page #anchor
 *   to a heading of that guide, and a GitHub source link to a file or folder
 *   that exists in this repository (with a real heading for an .md anchor);
 * - no source link is dropped as unsafe or escaping the repository.
 *
 * With `--built <dir>` (a gallery or showcase build): every public guide has
 * its /docs/<slug>/ page, no other guide does, and /docs/ and the search index
 * exist with every public guide in the index.
 *
 * With `--sitemap <dir>`: every <loc> of <dir>/sitemap.xml maps to a built
 * page in <dir> that is not `noindex` (the standalone player is not a landing
 * page), and every public guide's page is listed.
 *
 * Each failure names the missing source, link or route. Exit 0 when clean,
 * 1 on any problem, 2 on usage errors.
 *
 *   pnpm exec tsx scripts/check-public-docs.ts [--built <dir>] [--sitemap <dir>] [--json]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GITHUB_SOURCE,
  getPublicDocs,
  PUBLIC_GUIDES,
  renderMarkdown,
  rewriteDocLink,
} from '../apps/gallery/src/lib/docs/index.ts';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

export interface DocsCheckReport {
  ok: boolean;
  problems: string[];
  counts: { guides: number; links: number; routes: number; locs: number };
}

export interface DocsCheckOptions {
  root?: string;
  /** A built site (gallery dist or showcase) whose /docs/ routes are checked. */
  built?: string;
  /** A built site whose sitemap.xml <loc> entries must map to built pages. */
  sitemap?: string;
}

/** Heading ids of a Markdown file, as the docs renderer computes them. */
function headingIds(path: string, filename: string): Set<string> {
  return new Set(renderMarkdown(readFileSync(path, 'utf8'), filename).headings.map((h) => h.id));
}

/** `[label](href)` links of a Markdown source, outside fenced and inline code. */
export function sourceLinks(markdown: string): string[] {
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .filter((match) => match[1] !== '!')
    .map((match) => match[2] ?? '');
}

/** Checks the sources and every link of the public guides. */
function checkGuides(root: string, problems: string[], counts: DocsCheckReport['counts']) {
  const docsDir = join(root, 'docs');
  for (const guide of PUBLIC_GUIDES) {
    if (!existsSync(join(docsDir, `${guide}.md`))) {
      problems.push(`missing source: docs/${guide}.md is a public guide but does not exist`);
    }
  }
  const docs = getPublicDocs();
  counts.guides = docs.length;
  const ids = new Map(docs.map((doc) => [doc.slug, new Set(doc.headings.map((h) => h.id))]));
  const mdIds = new Map<string, Set<string>>();

  for (const doc of docs) {
    const where = `docs/${doc.filename}`;
    for (const href of sourceLinks(readFileSync(join(docsDir, doc.filename), 'utf8'))) {
      if (rewriteDocLink(doc.filename, href) === null) {
        problems.push(`${where}: link "${href}" is unsafe or leaves the repository`);
      }
    }
    for (const [, raw] of doc.html.matchAll(/<a href="([^"]+)"/g)) {
      const href = (raw ?? '').replaceAll('&amp;', '&');
      counts.links += 1;
      const [path = '', fragment] = href.split('#');
      if (href.startsWith('#')) {
        if (!ids.get(doc.slug)?.has(fragment ?? '')) {
          problems.push(`${where}: anchor "${href}" has no heading in this guide`);
        }
      } else if (path.startsWith('/docs/')) {
        const slug = /^\/docs\/([a-z0-9_-]+)\/$/.exec(path)?.[1];
        const target = slug ? ids.get(slug) : undefined;
        if (!target) problems.push(`${where}: link "${href}" is not a public guide page`);
        else if (fragment && !target.has(fragment)) {
          problems.push(`${where}: link "${href}" points at a missing heading`);
        }
      } else if (href.startsWith(GITHUB_SOURCE)) {
        const relative = decodeURIComponent(path.slice(GITHUB_SOURCE.length)).replace(/\/$/, '');
        const file = join(root, relative);
        if (!relative || !existsSync(file)) {
          problems.push(
            `${where}: link "${href}" points at ${relative || '(empty)'}, which does not exist`
          );
        } else if (fragment && relative.endsWith('.md') && statSync(file).isFile()) {
          let known = mdIds.get(relative);
          if (!known) {
            known = headingIds(file, posix.basename(relative));
            mdIds.set(relative, known);
          }
          if (!known.has(fragment)) {
            problems.push(`${where}: link "${href}" points at a missing heading in ${relative}`);
          }
        }
      }
    }
  }
  return docs;
}

/** The built /docs/ routes match the public guide set. */
export function checkBuilt(
  dir: string,
  slugs: string[],
  problems: string[],
  counts: DocsCheckReport['counts']
) {
  const docsDir = join(dir, 'docs');
  if (!existsSync(join(docsDir, 'index.html')))
    problems.push(`missing route: ${dir}/docs/index.html`);
  for (const slug of slugs) {
    counts.routes += 1;
    if (!existsSync(join(docsDir, slug, 'index.html'))) {
      problems.push(`missing route: /docs/${slug}/ (no ${dir}/docs/${slug}/index.html)`);
    }
  }
  if (existsSync(docsDir)) {
    for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !slugs.includes(entry.name)) {
        problems.push(`unexpected route: /docs/${entry.name}/ is not a public guide`);
      }
    }
  }
  const index = join(docsDir, 'search-index.json');
  if (!existsSync(index)) {
    problems.push(`missing route: /docs/search-index.json (no ${index})`);
    return;
  }
  const text = readFileSync(index, 'utf8');
  for (const slug of slugs) {
    if (!text.includes(`/docs/${slug}/`)) {
      problems.push(`search index: /docs/${slug}/ is not in docs/search-index.json`);
    }
  }
}

/** Every sitemap <loc> is a built page, and every public guide is listed. */
export function checkSitemap(
  dir: string,
  slugs: string[],
  problems: string[],
  counts: DocsCheckReport['counts']
) {
  const path = join(dir, 'sitemap.xml');
  if (!existsSync(path)) {
    problems.push(`missing route: ${path}`);
    return;
  }
  const locs = [...readFileSync(path, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1] ?? ''
  );
  counts.locs = locs.length;
  if (locs.length === 0) problems.push(`sitemap: ${path} lists no <loc>`);
  // The site's base path is the shortest loc path (the home page).
  const paths = locs.map((loc) => new URL(loc).pathname);
  const base = paths.reduce((a, b) => (b.length < a.length ? b : a), paths[0] ?? '/');
  for (const [i, pathname] of paths.entries()) {
    if (!pathname.startsWith(base)) {
      problems.push(`sitemap: ${locs[i]} is outside the site base ${base}`);
      continue;
    }
    const rel = decodeURIComponent(pathname.slice(base.length));
    const file = rel === '' || rel.endsWith('/') ? join(dir, rel, 'index.html') : join(dir, rel);
    if (!existsSync(file)) problems.push(`sitemap: ${locs[i]} has no built page (${file})`);
    else if (
      file.endsWith('.html') &&
      /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(file, 'utf8'))
    ) {
      problems.push(`sitemap: ${locs[i]} is a noindex page (${file})`);
    }
  }
  for (const slug of slugs) {
    if (!paths.some((p) => p.endsWith(`/docs/${slug}/`))) {
      problems.push(`sitemap: /docs/${slug}/ is not listed`);
    }
  }
}

export function checkPublicDocs(options: DocsCheckOptions = {}): DocsCheckReport {
  const root = options.root ?? REPO;
  const problems: string[] = [];
  const counts = { guides: 0, links: 0, routes: 0, locs: 0 };
  const docs = checkGuides(root, problems, counts);
  const slugs = docs.map((doc) => doc.slug);
  if (options.built) checkBuilt(resolve(root, options.built), slugs, problems, counts);
  if (options.sitemap) checkSitemap(resolve(root, options.sitemap), slugs, problems, counts);
  return { ok: problems.length === 0, problems, counts };
}

export function parseArgs(argv: readonly string[]): DocsCheckOptions & { json: boolean } {
  const options: DocsCheckOptions & { json: boolean } = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--built' || arg === '--sitemap') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a directory`);
      options[arg === '--built' ? 'built' : 'sitemap'] = value;
    } else throw new Error(`Unknown option ${arg}`);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let options: ReturnType<typeof parseArgs> | undefined;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`check-public-docs: ${(error as Error).message}`);
    process.exitCode = 2;
  }
  if (options) {
    const report = checkPublicDocs(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      for (const problem of report.problems) console.log(`✗ ${problem}`);
      const { guides, links, routes, locs } = report.counts;
      console.log(
        `${report.ok ? '✓' : '✗'} ${guides} public guides, ${links} links` +
          (options.built ? `, ${routes} routes` : '') +
          (options.sitemap ? `, ${locs} sitemap entries` : '') +
          `: ${report.problems.length} problem(s)`
      );
    }
    process.exitCode = report.ok ? 0 : 1;
  }
}
