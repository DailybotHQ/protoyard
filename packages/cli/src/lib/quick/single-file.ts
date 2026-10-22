import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkTextAsset } from '../artifact-pack.ts';
import { entryGraph } from './chunk-graph.ts';

/**
 * One self-contained HTML file for an exploration (`protoyard quick export
 * --single-file`): the built player's JavaScript and CSS plus the blueprint,
 * openable from `file://` with no server, no network and no service worker.
 *
 * A browser cannot load module chunks from `file://`, so every chunk is
 * embedded as inert text and turned into a `blob:` module at startup:
 *
 * - each chunk's relative imports (`"./x-hash.js"`, static and dynamic) are
 *   rewritten to bare `py:assets/x-hash.js` specifiers, which an import map
 *   (built by a small bootstrap script) points at the chunks' blob URLs. Bare
 *   specifiers resolve through the map whatever the importer's base, so
 *   circular chunk imports work too;
 * - `import.meta.url` becomes a data URL and Vite's emitted preload resolver
 *   is rewritten to data URLs. Relative worker URLs then fail before network
 *   access (the player falls back to main-thread generation), while no
 *   preload can request the reserved `.invalid` host;
 * - only the chunks the chosen page can reach (static and dynamic imports,
 *   chunk-graph.ts) are embedded: `deck.html`, `page.html` or `doc.html` for a
 *   content kind (no CRUD shell, Faker or app kits), `index.html` for an app;
 * - every stylesheet those chunks can load is inlined up front, so lazy
 *   screens are styled without their CSS preloads;
 * - the world-generation worker cannot start from a blob base, so the player
 *   falls back to generating on the main thread (it already does when Workers
 *   fail).
 *
 * The blueprint is an inert `<script type="application/json"
 * id="protoyard-blueprint">` with `<` escaped, so no `</script` or `<!--` can
 * appear in it; the player reads it as an untrusted source.
 */

/**
 * Cap on the exported file (UTF-8 bytes, uncompressed). Measured 2026-10-20 over
 * the 40 catalog blueprints: 3,245,592–3,246,497 bytes (about 1.05 MB gzip); the
 * player dominates and the blueprint adds a few KB. 4 MiB leaves ~29% headroom.
 */
export const QUICK_SINGLE_FILE_BUDGET_BYTES = 4 * 1024 * 1024;

/** The player page a single file starts from (deck.html, page.html, doc.html or index.html). */
export type SingleFileEntry = 'index' | 'deck' | 'page' | 'doc';

/**
 * Cap per entry. A deck, page or doc exported from its own page embeds only
 * that page's graph: measured 2026-10-22 at 1,606,788–1,607,557 bytes (the
 * catalog deck, page and doc). 2 MiB leaves ~23% headroom, like the app cap.
 * The proposed 1.5 MiB deck budget (ADR-040, `kinds.deck.singleFileKb`) is
 * not met: DevTools (Deck Studio, themes), review comments, device shells and
 * chart blocks are all reachable from a kind page and ship with it.
 */
export const QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES: Record<SingleFileEntry, number> = {
  index: QUICK_SINGLE_FILE_BUDGET_BYTES,
  deck: 2 * 1024 * 1024,
  page: 2 * 1024 * 1024,
  doc: 2 * 1024 * 1024,
};

/**
 * Modules a content kind can reach but never runs, left out of deck, page and
 * doc files. Faker is reachable through the scenarios package's lazy loader,
 * which only a generated world calls; the kind runtime (`defineKindRuntime`)
 * supplies `generateWorld` and no timeline, so it never generates.
 */
export const SINGLE_FILE_KIND_EXCLUDED_MODULES: readonly RegExp[] = [
  /[\\/]@faker-js[\\/]faker[\\/]/,
];

/** Emitted files of the modules matching `patterns`, from the player's Vite manifest (none without one). */
async function manifestFiles(playerDir: string, patterns: readonly RegExp[]): Promise<Set<string>> {
  const text = await readFile(join(playerDir, '.vite', 'manifest.json'), 'utf8').catch(() => null);
  if (text === null) return new Set();
  const manifest = JSON.parse(text) as Record<string, { file?: unknown }>;
  const files = new Set<string>();
  for (const [key, chunk] of Object.entries(manifest)) {
    if (typeof chunk.file === 'string' && patterns.some((pattern) => pattern.test(key))) {
      files.add(chunk.file.replace(/^assets\//, ''));
    }
  }
  return files;
}

/** The page that runs a blueprint of this kind (an app may leave `kind` out). */
export function singleFileEntryFor(blueprint: object): SingleFileEntry {
  const kind = 'kind' in blueprint ? blueprint.kind : undefined;
  return kind === 'deck' || kind === 'page' || kind === 'doc' ? kind : 'index';
}
/** The `id` the player reads the embedded blueprint from (EMBEDDED_BLUEPRINT_ID in the player). */
export const SINGLE_FILE_BLUEPRINT_ID = 'protoyard-blueprint';
/** Non-network base used by the inlined bundle; it cannot resolve external assets. */
export const SINGLE_FILE_BASE = 'data:application/javascript,';

/**
 * The single file's policy: inline scripts and blob modules only (the import
 * map and blob URLs are created at runtime, so they cannot be hashed), inline
 * styles, data/blob images, and no network at all (`connect-src 'none'`).
 */
export const SINGLE_FILE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  'worker-src blob:',
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export interface SingleFileInput {
  /** The built player app folder (index.html and assets/). */
  playerDir: string;
  /** The blueprint's JSON text (already validated by the caller). */
  blueprintJson: string;
  /** Page title (the blueprint name). */
  title: string;
  /**
   * The player page to start from (default `index`). A player built before the
   * per-kind pages has only index.html; the export then falls back to it.
   */
  entry?: SingleFileEntry;
}

export interface SingleFileResult {
  html: string;
  bytes: number;
  /** The page the file was built from (index when the requested one is missing). */
  entry: SingleFileEntry;
  /** Embedded JS chunks (reachable from the entry; the worker is left out). */
  chunks: number;
  stylesheets: number;
}

export class SingleFileError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'SingleFileError';
    this.issues = issues;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Makes text safe inside a raw-text `<script>` element: the HTML parser ends
 * the element at the first `</script` and treats `<!--` specially, so both are
 * broken with a backslash. In JavaScript these only occur in strings, template
 * literals, regular expressions and comments, where `\/` and `\!` keep their
 * meaning.
 */
export function escapeScriptText(text: string): string {
  return text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/** The blueprint as inert JSON: `<`, U+2028 and U+2029 escaped (JSON.parse reads them back). */
export function inertJson(json: string): string {
  return JSON.stringify(JSON.parse(json))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Rewrites one chunk for blob loading: relative chunk imports, the preload map's
 * stylesheet entries (already inlined; renamed so the preload helper never waits
 * for a stylesheet the CSP blocks) and `import.meta.url`.
 */
export function rewriteChunk(
  text: string,
  name: string,
  chunks: ReadonlySet<string>,
  stylesheets: ReadonlySet<string> = new Set()
): string {
  return (
    text
      // Vite's emitted relative-base helper creates preload links. In a single
      // file, every stylesheet and chunk is already embedded, so resolve those
      // URLs to an inert data URL instead of issuing HTTP(S) requests.
      .replace(
        /function\s*\(\s*[\w$]+\s*,\s*[\w$]+\s*\)\s*\{\s*return\s+new URL\([\w$]+,\s*[\w$]+\)\.href\s*\}/g,
        'function(){return "data:application/javascript,"}'
      )
      .replace(/(["'`])\.\/([\w.-]+\.js)\1/g, (match, quote: string, file: string) =>
        chunks.has(file) ? `${quote}py:assets/${file}${quote}` : match
      )
      .replace(
        /(["'`])(\.\/|assets\/)([\w.-]+\.css)\1/g,
        (match, quote: string, prefix: string, file: string) =>
          stylesheets.has(file) ? `${quote}${prefix}${file}-inlined${quote}` : match
      )
      .replace(/\bimport\.meta\.url\b/g, JSON.stringify(`${SINGLE_FILE_BASE}assets/${name}`))
  );
}

/** The classic script that turns the embedded chunks into an import map and starts the app. */
function bootstrap(entry: string): string {
  return `(()=>{var m={};document.querySelectorAll('script[type="text/plain"][data-py-chunk]').forEach(function(s){m["py:assets/"+s.dataset.pyChunk]=URL.createObjectURL(new Blob([s.textContent],{type:"text/javascript"}))});var i=document.createElement("script");i.type="importmap";i.textContent=JSON.stringify({imports:m});document.head.appendChild(i);addEventListener("vite:preloadError",function(e){e.preventDefault()});var s=document.createElement("script");s.type="module";s.textContent='import "py:assets/${entry}";';document.body.appendChild(s)})();`;
}

/** Builds the single HTML file from a built player and a blueprint. */
export async function buildSingleFile(input: SingleFileInput): Promise<SingleFileResult> {
  const requested = input.entry ?? 'index';
  const exists = (file: string) =>
    access(join(input.playerDir, file)).then(
      () => true,
      () => false
    );
  const page: SingleFileEntry =
    requested !== 'index' && !(await exists(`${requested}.html`)) ? 'index' : requested;
  const indexHtml = await readFile(join(input.playerDir, `${page}.html`), 'utf8');
  const assetsDir = join(input.playerDir, 'assets');
  const files = (await readdir(assetsDir)).sort();
  const issues: string[] = [];

  // Only what this page can load: its entry chunk and every chunk and
  // stylesheet reachable from it. The world-generation worker never starts
  // from a blob base: leave it out. A kind page also leaves out what a kind
  // never runs (Faker).
  const neverRun =
    page === 'index'
      ? new Set<string>()
      : await manifestFiles(input.playerDir, SINGLE_FILE_KIND_EXCLUDED_MODULES);
  const graph = await entryGraph({
    html: indexHtml,
    files,
    read: (file) => readFile(join(assetsDir, file), 'utf8'),
    exclude: (file) => /^generate\.worker-/.test(file) || neverRun.has(file),
  });
  if (!graph) throw new SingleFileError(`The player ${page}.html has no module entry script.`);
  const entry = graph.entry;
  if (!files.includes(entry)) throw new SingleFileError(`The entry chunk ${entry} is missing.`);
  const jsFiles = graph.js;
  const chunkSet = new Set(jsFiles);

  const cssSet = new Set(graph.css);
  const chunkTags: string[] = [];
  for (const file of jsFiles) {
    const text = await readFile(join(assetsDir, file), 'utf8');
    for (const issue of checkTextAsset(`assets/${file}`, text))
      issues.push(`${issue.path}: ${issue.reason}`);
    chunkTags.push(
      `<script type="text/plain" data-py-chunk="${escapeHtml(file)}">${escapeScriptText(rewriteChunk(text, file, chunkSet, cssSet))}</script>`
    );
  }

  // Stylesheets the page links come first, in order; lazy screens' CSS follows.
  const cssFiles = graph.css;
  const styleTags: string[] = [];
  for (const file of cssFiles) {
    const css = await readFile(join(assetsDir, file), 'utf8');
    for (const issue of checkTextAsset(`assets/${file}`, css))
      issues.push(`${issue.path}: ${issue.reason}`);
    if (/url\(\s*["']?(?!data:)[^"')\s]/i.test(css)) {
      issues.push(`assets/${file}: references a file with url(); the single file has none`);
    }
    styleTags.push(
      `<style data-py-style="${escapeHtml(file)}">${css.replace(/<\/(style)/gi, '<\\/$1')}</style>`
    );
  }
  if (issues.length > 0) {
    throw new SingleFileError('The player build cannot be inlined into one file.', issues);
  }

  // Keep the head's metadata and its inline classic scripts (appearance replay,
  // zod's jitless switch); drop the CSP (replaced), links, module scripts and
  // anything that registers a service worker.
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(indexHtml)?.[1] ?? '';
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => !/http-equiv\s*=\s*["']?content-security-policy/i.test(tag));
  const inlineScripts = [...head.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes = '']) => !/\b(src|type)\s*=/.test(attributes))
    .map(([, , body = '']) => body)
    .filter((body) => !/serviceWorker/.test(body));
  const body = (/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(indexHtml)?.[1] ?? '')
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '')
    .replace(/<script(\s[^>]*)?>[\s\S]*?serviceWorker[\s\S]*?<\/script>/gi, '')
    .trim();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="${SINGLE_FILE_CSP}">
${metas.join('\n')}
<title>${escapeHtml(input.title)}</title>
${inlineScripts.map((script) => `<script>${script}</script>`).join('\n')}
${styleTags.join('\n')}
</head>
<body>
${body}
<script type="application/json" id="${SINGLE_FILE_BLUEPRINT_ID}">${inertJson(input.blueprintJson)}</script>
${chunkTags.join('\n')}
<script>${bootstrap(entry)}</script>
</body>
</html>
`;
  if (
    /\bserviceWorker\s*\.\s*register\s*\(/.test(
      html.replace(/<script type="text\/plain"[\s\S]*?<\/script>/g, '')
    )
  ) {
    throw new SingleFileError('The single file would register a service worker.');
  }
  return {
    html,
    bytes: Buffer.byteLength(html, 'utf8'),
    entry: page,
    chunks: jsFiles.length,
    stylesheets: cssFiles.length,
  };
}
