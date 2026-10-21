import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkTextAsset, parseAttributes } from '../artifact-pack.ts';

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
 * - `import.meta.url` becomes a fixed `https://….invalid/` URL, because a
 *   blob URL cannot be a base for `new URL(relative, base)`. Vite's preload
 *   helper then asks for files that do not exist; the strict CSP blocks the
 *   request and a `vite:preloadError` listener lets the import go on;
 * - every stylesheet is inlined up front, so lazy screens are styled without
 *   their CSS preloads;
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
/** The `id` the player reads the embedded blueprint from (EMBEDDED_BLUEPRINT_ID in the player). */
export const SINGLE_FILE_BLUEPRINT_ID = 'protoyard-blueprint';
/** Base that `import.meta.url` is rewritten to: `.invalid` never resolves (RFC 6761). */
export const SINGLE_FILE_BASE = 'https://protoyard-single-file.invalid/';

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
}

export interface SingleFileResult {
  html: string;
  bytes: number;
  /** Embedded JS chunks (the worker entry is left out). */
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
  return text
    .replace(/(["'`])\.\/([\w.-]+\.js)\1/g, (match, quote: string, file: string) =>
      chunks.has(file) ? `${quote}py:assets/${file}${quote}` : match
    )
    .replace(
      /(["'`])(\.\/|assets\/)([\w.-]+\.css)\1/g,
      (match, quote: string, prefix: string, file: string) =>
        stylesheets.has(file) ? `${quote}${prefix}${file}-inlined${quote}` : match
    )
    .replace(/\bimport\.meta\.url\b/g, JSON.stringify(`${SINGLE_FILE_BASE}assets/${name}`));
}

/** The classic script that turns the embedded chunks into an import map and starts the app. */
function bootstrap(entry: string): string {
  return `(()=>{var m={};document.querySelectorAll('script[type="text/plain"][data-py-chunk]').forEach(function(s){m["py:assets/"+s.dataset.pyChunk]=URL.createObjectURL(new Blob([s.textContent],{type:"text/javascript"}))});var i=document.createElement("script");i.type="importmap";i.textContent=JSON.stringify({imports:m});document.head.appendChild(i);addEventListener("vite:preloadError",function(e){e.preventDefault()});var s=document.createElement("script");s.type="module";s.textContent='import "py:assets/${entry}";';document.body.appendChild(s)})();`;
}

/** Builds the single HTML file from a built player and a blueprint. */
export async function buildSingleFile(input: SingleFileInput): Promise<SingleFileResult> {
  const indexHtml = await readFile(join(input.playerDir, 'index.html'), 'utf8');
  const assetsDir = join(input.playerDir, 'assets');
  const files = (await readdir(assetsDir)).sort();
  const issues: string[] = [];

  const entryMatch = /<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/assets\/([\w.-]+\.js)"/i.exec(
    indexHtml
  );
  if (!entryMatch) throw new SingleFileError('The player index.html has no module entry script.');
  const entry = entryMatch[1] as string;

  // The world-generation worker never starts from a blob base: leave it out.
  const jsFiles = files.filter((file) => file.endsWith('.js') && !/^generate\.worker-/.test(file));
  const chunkSet = new Set(jsFiles);
  if (!chunkSet.has(entry)) throw new SingleFileError(`The entry chunk ${entry} is missing.`);

  const cssSet = new Set(files.filter((file) => file.endsWith('.css')));
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
  const linked = [...indexHtml.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => parseAttributes(tag))
    .filter(
      (attributes) => attributes.rel === 'stylesheet' && attributes.href?.startsWith('./assets/')
    )
    .map((attributes) => (attributes.href as string).slice('./assets/'.length));
  const cssFiles = [
    ...linked,
    ...files.filter((file) => file.endsWith('.css') && !linked.includes(file)),
  ];
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
    chunks: jsFiles.length,
    stylesheets: cssFiles.length,
  };
}
