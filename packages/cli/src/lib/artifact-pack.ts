import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { digestDirectory, type FileDigest, sha256Text } from './checksum.ts';
import { buildDigest } from './publish-ledger.ts';

/**
 * Packs a verified prototype build (`dist/`) into a folder that an agent can
 * publish with the Claude Artifact tool unchanged (ADR-026):
 *
 * - `page.html`: the page as BODY CONTENT. The Artifact tool wraps the page in
 *   its own document skeleton (doctype, charset and viewport metas, a reset),
 *   so the build's `<html>`, `<head>` and `<body>` wrappers are dropped and
 *   what matters is kept: `<title>` first, a theme-token `<style>`, the
 *   no-flash script, the description meta, stylesheets, module preloads, the
 *   module entry and the body markup (`#app`).
 * - every other dist file at the same relative path (the published path the
 *   HTML references, without `./`);
 * - `artifact-manifest.json`: sizes, sha256, content types, publish batches
 *   and the exact Artifact publish arguments.
 *
 * Every artifact rule is checked and reported with the path and the reason;
 * nothing is written when any rule fails. The transform and checks are pure
 * functions over strings; `packArtifact` does the file I/O.
 */

export const ARTIFACT_PACK_FORMAT = 'protoyard.artifact-pack' as const;
export const ARTIFACT_PACK_FORMAT_VERSION = 1 as const;
export const ARTIFACT_PAGE = 'page.html';
export const ARTIFACT_MANIFEST = 'artifact-manifest.json';

/** The Artifact tool's limits, in decimal megabytes (the conservative reading of "16MB"). */
export const ARTIFACT_LIMITS = {
  textFileBytes: 16_000_000,
  binaryFileBytes: 15_000_000,
  filesPerPublish: 255,
  bytesPerPublish: 64_000_000,
  filesPerVersion: 511,
  bytesPerVersion: 256_000_000,
  titleWords: 4,
} as const;

/**
 * Avatar sizes an artifact build ships: 128 px only. The library is 175
 * images per size, so both sizes would be 350 files (513,196 B) next to the
 * app's own; 128 px alone is 175 files (356,386 B). Measured 2026-10-19:
 * relay-chat-demo (32 app files) stays in one 255-file publish instead of
 * two, and ui-kit (180 app files) packs 356 files in two publishes, where
 * both sizes would be 531 files, over the 511-file version cap.
 * `avatarUrl(id, 64)` then resolves to the 128 px file and `avatarSrcset` is
 * omitted; the browser downscales, about 1 KB more per face shown at 1x.
 */
export const ARTIFACT_AVATAR_SIZES: readonly number[] = [128];

/** Avatar images in a build: `avatars/<size>/av-NNN.webp`. */
const AVATAR_FILE = /^avatars\/(\d+)\/av-\d{3}\.webp$/;

/**
 * Runtime capabilities declared when a pack enables review comments (`export
 * --target artifact --comments`): a shared `db` store under `review/` that
 * every admitted viewer reads and Contributors and above write, and the
 * `user` capability for author ids and display names, and a write-only
 * `comments` composer for viewers who cannot write to the shared database.
 * The shape follows the Artifact capability docs.
 */
export const ARTIFACT_COMMENT_CAPABILITIES: Readonly<Record<string, unknown>> = {
  db: { rules: [{ path: 'review', read: 'view', write: 'interact' }] },
  user: { scopes: ['profile'] },
  comments: { composer_only: true },
};

/** Hosts the Artifact tool accepts for external scripts (https only). */
export const SCRIPT_CDN_PREFIXES = [
  'https://cdnjs.cloudflare.com/',
  'https://cdn.jsdelivr.net/npm/',
  'https://unpkg.com/',
  'https://cdn.tailwindcss.com',
  'https://code.jquery.com/',
] as const;
/** The only external stylesheets the Artifact tool accepts. */
export const STYLESHEET_PREFIXES = ['https://fonts.googleapis.com/'] as const;

/** Standard web media types allowed in an artifact, by extension. */
const CONTENT_TYPES: Record<string, { type: string; text: boolean }> = {
  js: { type: 'text/javascript', text: true },
  mjs: { type: 'text/javascript', text: true },
  css: { type: 'text/css', text: true },
  html: { type: 'text/html', text: true },
  svg: { type: 'image/svg+xml', text: true },
  json: { type: 'application/json', text: true },
  txt: { type: 'text/plain', text: true },
  png: { type: 'image/png', text: false },
  jpg: { type: 'image/jpeg', text: false },
  jpeg: { type: 'image/jpeg', text: false },
  webp: { type: 'image/webp', text: false },
  avif: { type: 'image/avif', text: false },
  gif: { type: 'image/gif', text: false },
  ico: { type: 'image/x-icon', text: false },
  woff2: { type: 'font/woff2', text: false },
  woff: { type: 'font/woff', text: false },
  // font/ttf and font/otf are registered web types (RFC 8081); the Artifact tool
  // serves them as binary assets the same way it serves woff/woff2.
  ttf: { type: 'font/ttf', text: false },
  otf: { type: 'font/otf', text: false },
};
const SOURCE_MAP = { type: 'application/json', text: true };

export interface PackIssue {
  /** The file (published path) or `page.html` the issue is about. */
  path: string;
  reason: string;
}

// ── Tag scanner ─────────────────────────────────────────────────────────────

/** Parses the attributes of one start tag (`<tag a="1" b>` → `{ a: '1', b: '' }`). */
export function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = (match[1] as string).toLowerCase();
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function serializeTag(name: string, attributes: Record<string, string>, close: boolean): string {
  const parts = Object.entries(attributes).map(([key, value]) =>
    value === '' && ['crossorigin', 'async', 'defer', 'nomodule'].includes(key)
      ? key
      : `${key}="${escapeAttribute(value)}"`
  );
  const open = `<${name}${parts.length ? ` ${parts.join(' ')}` : ''}>`;
  return close ? `${open}</${name}>` : open;
}

/** Attribute values come from HTML source (already escaped): decode, then escape once. */
function escapeAttribute(value: string): string {
  return decodeText(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// ── URL classification ──────────────────────────────────────────────────────

type UrlKind = 'relative' | 'root' | 'external' | 'data' | 'fragment' | 'unsafe';

export function classifyUrl(url: string): UrlKind {
  const value = url.trim();
  if (value.startsWith('#')) return 'fragment';
  if (/^data:/i.test(value)) return 'data';
  if (/^(?:https?:)?\/\//i.test(value)) return 'external';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return 'unsafe';
  if (value.startsWith('/')) return 'root';
  return 'relative';
}

/** `./assets/a.js` → `assets/a.js`; `assets/../x` is refused by the caller (escapes). */
export function publishedPath(url: string): string | null {
  const clean = url.trim().split(/[?#]/)[0] as string;
  const parts: string[] = [];
  for (const segment of clean.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.length ? parts.join('/') : null;
}

function startsWithAny(url: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => url.startsWith(prefix));
}

// ── Page transform ──────────────────────────────────────────────────────────

export interface TransformedPage {
  /** Body-content HTML for the Artifact tool (no doctype, html, head or body tags). */
  page: string;
  title: string;
  /** Published paths the page references (scripts, stylesheets, preloads). */
  references: string[];
  issues: PackIssue[];
  warnings: string[];
}

/**
 * The page contract's color tokens: light values on `:root`, dark values under
 * `prefers-color-scheme` unless the page says light, and again for an explicit
 * dark theme. The app's own `--py-*` tokens win once the theme engine runs.
 */
export const ARTIFACT_PAGE_STYLE = [
  ':root{--py-artifact-background:#fafafa;--py-artifact-foreground:#09090b;color-scheme:light dark}',
  '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--py-artifact-background:#09090b;--py-artifact-foreground:#fafafa}}',
  ':root[data-theme="dark"]{--py-artifact-background:#09090b;--py-artifact-foreground:#fafafa}',
  'html,body{margin:0;background:var(--py-background,var(--py-artifact-background));color:var(--py-foreground,var(--py-artifact-foreground))}',
].join('\n');

const SERVICE_WORKER = /\bserviceWorker\s*\.\s*register\s*\(/;

/** Turns a build's `index.html` into Artifact page content, checking every reference. */
export function transformPage(
  indexHtml: string,
  options: { allowStaticPage?: boolean } = {}
): TransformedPage {
  const issues: PackIssue[] = [];
  const warnings: string[] = [];
  const references: string[] = [];
  const issue = (reason: string) => issues.push({ path: ARTIFACT_PAGE, reason });

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(indexHtml);
  const title = decodeText(titleMatch?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) issue('index.html has no <title>; the Artifact page needs a non-empty title');
  else if (title.split(' ').length > ARTIFACT_LIMITS.titleWords) {
    warnings.push(
      `The title "${title}" is longer than ${ARTIFACT_LIMITS.titleWords} words; Artifact titles read best as a short name`
    );
  }
  if (/<base\b/i.test(indexHtml)) {
    issue('index.html has a <base> element; relative asset paths would resolve elsewhere');
  }

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(indexHtml);
  const headSource = bodyMatch ? indexHtml.slice(0, bodyMatch.index) : indexHtml;
  const body = (bodyMatch?.[1] ?? '').trim();
  if (!bodyMatch) issue('index.html has no <body>');

  const inlineScripts: string[] = [];
  const styles: string[] = [];
  const metas: string[] = [];
  const stylesheets: string[] = [];
  const preloads: string[] = [];
  const modules: string[] = [];

  const reference = (url: string, attribute: string): string | null => {
    const kind = classifyUrl(url);
    if (kind === 'root') {
      issue(`${attribute} "${url}" is root-absolute; build with the relative base ./`);
      return null;
    }
    if (kind === 'unsafe' || kind === 'data' || kind === 'fragment') {
      issue(`${attribute} "${url}" is not a file path the Artifact can serve`);
      return null;
    }
    const path = publishedPath(url);
    if (!path) {
      issue(`${attribute} "${url}" leaves the build folder`);
      return null;
    }
    references.push(path);
    return path;
  };

  // Scripts (inline and external), with their contents.
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of [headSource, body].flatMap((part) => [...part.matchAll(scriptPattern)])) {
    const attributes = parseAttributes(match[1] as string);
    const content = match[2] as string;
    if (attributes.src === undefined) {
      if (SERVICE_WORKER.test(content)) {
        issue('an inline script registers a service worker; build without offline support');
      }
      inlineScripts.push(`<script>${content}</script>`);
      continue;
    }
    if (classifyUrl(attributes.src) === 'external') {
      if (!startsWithAny(attributes.src, SCRIPT_CDN_PREFIXES)) {
        issue(
          `script "${attributes.src}" is external; the Artifact page loads scripts only from ${SCRIPT_CDN_PREFIXES.join(', ')}`
        );
      } else modules.push(serializeTag('script', attributes, true));
      continue;
    }
    const path = reference(attributes.src, 'script src');
    if (path) modules.push(serializeTag('script', { ...attributes, src: path }, true));
  }

  // Head elements other than scripts: inline styles, links, metas.
  const headWithoutScripts = headSource.replace(scriptPattern, '');
  for (const match of headWithoutScripts.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    styles.push(`<style>${match[1]}</style>`);
  }
  for (const match of headWithoutScripts.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1] as string);
    const rel = (attributes.rel ?? '').toLowerCase().split(/\s+/);
    const href = attributes.href ?? '';
    if (rel.includes('stylesheet')) {
      if (classifyUrl(href) === 'external') {
        if (startsWithAny(href, STYLESHEET_PREFIXES)) {
          stylesheets.push(serializeTag('link', attributes, false));
        } else {
          issue(
            `stylesheet "${href}" is external; the Artifact page loads stylesheets only from Google Fonts`
          );
        }
        continue;
      }
      const path = reference(href, 'stylesheet href');
      if (path) stylesheets.push(serializeTag('link', { ...attributes, href: path }, false));
    } else if (rel.includes('modulepreload') || rel.includes('preload')) {
      if (classifyUrl(href) === 'external') {
        issue(`preload "${href}" is external; the Artifact page fetches only its own files`);
        continue;
      }
      const path = reference(href, 'preload href');
      if (path) preloads.push(serializeTag('link', { ...attributes, href: path }, false));
    } else if (rel.includes('manifest')) {
      issue('index.html links a web app manifest; build without offline support');
    }
    // Icons and other links are dropped: the Artifact viewer owns the tab icon.
  }
  for (const match of headWithoutScripts.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1] as string);
    const name = (attributes.name ?? '').toLowerCase();
    // charset and viewport come from the Artifact skeleton.
    if (name === 'description' || name.startsWith('protoyard:')) {
      metas.push(serializeTag('meta', attributes, false));
    }
  }

  if (!options.allowStaticPage && !modules.some((tag) => /type="module"/.test(tag))) {
    issue('index.html loads no module script; the prototype entry is missing');
  }

  // External resources inside the body markup (anchors are navigation, not fetches).
  for (const match of body.matchAll(/<(img|source|iframe|video|audio|embed|object)\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[2] as string);
    for (const attribute of ['src', 'data', 'poster']) {
      const value = attributes[attribute];
      if (value && classifyUrl(value) === 'external') {
        issue(
          `<${match[1]}> ${attribute} "${value}" is external; the Artifact page fetches only its own files`
        );
      }
    }
  }

  const page = [
    `<title>${escapeText(title)}</title>`,
    `<style>\n${ARTIFACT_PAGE_STYLE}\n</style>`,
    ...styles,
    ...inlineScripts,
    ...metas,
    ...stylesheets,
    ...preloads,
    ...modules,
    // Scripts found in the body were moved above with the others.
    body.replace(scriptPattern, '').trim(),
    '',
  ].join('\n');
  return { page, title, references: [...new Set(references)], issues, warnings };
}

// ── Asset checks ────────────────────────────────────────────────────────────

export function contentTypeFor(
  path: string,
  options: { allowSourceMaps?: boolean } = {}
): { type: string; text: boolean } | null {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  if (extension === 'map') return options.allowSourceMaps ? SOURCE_MAP : null;
  return CONTENT_TYPES[extension] ?? null;
}

/** Rules for one text asset's content: external fetches and service workers. */
export function checkTextAsset(path: string, text: string): PackIssue[] {
  const issues: PackIssue[] = [];
  if (/\.(?:css)$/i.test(path)) {
    for (const match of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      const url = match[1] as string;
      if (classifyUrl(url) === 'external' && !startsWithAny(url, STYLESHEET_PREFIXES)) {
        issues.push({
          path,
          reason: `@import "${url}" is external; only Google Fonts stylesheets are allowed`,
        });
      }
    }
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const url = (match[1] as string).trim();
      const kind = classifyUrl(url);
      if (kind === 'external' && !startsWithAny(url, STYLESHEET_PREFIXES)) {
        issues.push({
          path,
          reason: `url(${url}) is external; the Artifact fetches only its own files`,
        });
      } else if (kind === 'root') {
        issues.push({
          path,
          reason: `url(${url}) is root-absolute; build with the relative base ./`,
        });
      }
    }
  }
  if (/\.(?:m?js|html)$/i.test(path)) {
    if (SERVICE_WORKER.test(text)) {
      issues.push({ path, reason: 'registers a service worker; build without offline support' });
    }
    const external =
      /\bimport\s*\(\s*["'`]((?:https?:)?\/\/[^"'`]+)|\bfrom\s*["']((?:https?:)?\/\/[^"']+)|\bimport\s*["']((?:https?:)?\/\/[^"']+)/g;
    for (const match of text.matchAll(external)) {
      const url = (match[1] ?? match[2] ?? match[3]) as string;
      if (!startsWithAny(url, SCRIPT_CDN_PREFIXES)) {
        issues.push({ path, reason: `imports "${url}" over the network; bundle it instead` });
      }
    }
  }
  return issues;
}

/**
 * The Artifact tool refuses text files that contain U+FFFD, the replacement
 * character, because it usually marks a broken decode. Bundled libraries can
 * hold it on purpose (a `CSS.escape` polyfill returns it for NUL), so a JS,
 * JSON or CSS file gets the escape sequence instead, which means the same
 * character. Returns null when the text has none, or when this file type has
 * no escape.
 */
export function escapeReplacementCharacters(path: string, text: string): string | null {
  if (!text.includes('�')) return null;
  if (/\.(?:m?js|json)$/i.test(path)) return text.replaceAll('�', '\\uFFFD');
  if (/\.css$/i.test(path)) return text.replaceAll('�', '\\fffd ');
  return null;
}

// ── Batches ─────────────────────────────────────────────────────────────────

export interface PackBatch {
  /** 1-based publish order; batch 1 carries the page. */
  index: number;
  files: string[];
  bytes: number;
}

/**
 * Splits the files into publishes of at most 255 files and 64 MB (batch 1
 * also carries the page, which counts as one file), within the version caps
 * of 511 files and 256 MB.
 */
export function planBatches(
  pageBytes: number,
  files: readonly { path: string; bytes: number }[]
): { batches: PackBatch[]; issues: PackIssue[] } {
  const totalFiles = files.length + 1;
  const totalBytes = pageBytes + files.reduce((sum, file) => sum + file.bytes, 0);
  const issues: PackIssue[] = [];
  if (totalFiles > ARTIFACT_LIMITS.filesPerVersion) {
    issues.push({
      path: '(version)',
      reason: `${totalFiles} files exceed the ${ARTIFACT_LIMITS.filesPerVersion}-file limit of one Artifact version`,
    });
  }
  if (totalBytes > ARTIFACT_LIMITS.bytesPerVersion) {
    issues.push({
      path: '(version)',
      reason: `${totalBytes} bytes exceed the ${ARTIFACT_LIMITS.bytesPerVersion}-byte limit of one Artifact version`,
    });
  }
  if (issues.length) return { batches: [], issues };

  const batches: PackBatch[] = [{ index: 1, files: [], bytes: pageBytes }];
  let current = batches[0] as PackBatch;
  let count = 1;
  for (const file of files) {
    if (
      count + 1 > ARTIFACT_LIMITS.filesPerPublish ||
      current.bytes + file.bytes > ARTIFACT_LIMITS.bytesPerPublish
    ) {
      current = { index: batches.length + 1, files: [], bytes: 0 };
      batches.push(current);
      count = 0;
    }
    current.files.push(file.path);
    current.bytes += file.bytes;
    count += 1;
  }
  return { batches, issues };
}

// ── Manifest metadata ───────────────────────────────────────────────────────

/** One generic icon word per catalog category (never a product or brand). */
const CATEGORY_ICONS: Record<string, string> = {
  sales: 'briefcase',
  crm: 'briefcase',
  marketing: 'megaphone',
  support: 'help',
  helpdesk: 'help',
  finance: 'wallet',
  fintech: 'wallet',
  banking: 'wallet',
  commerce: 'cart',
  ecommerce: 'cart',
  marketplace: 'store',
  ai: 'chat',
  chat: 'chat',
  analytics: 'chart',
  dashboard: 'chart',
  'developer-tools': 'code',
  design: 'palette',
  education: 'book',
  health: 'health',
  hr: 'people',
  social: 'people',
  operations: 'truck',
  logistics: 'truck',
  media: 'video',
  travel: 'map',
  'real-estate': 'home',
  'internal-tools': 'tool',
  productivity: 'checklist',
};

export function iconForCategory(category: string | undefined): string {
  return CATEGORY_ICONS[(category ?? '').toLowerCase()] ?? 'app';
}

/** The icon of a deck, page or doc: what it is, whatever its category. */
const KIND_ICONS: Readonly<Record<string, string>> = {
  deck: 'slides',
  page: 'page',
  doc: 'document',
};

/** A content kind's icon (`slides`, `page`, `document`); an app's comes from its category. */
export function iconForBlueprint(blueprint: { kind?: string; category?: string }): string {
  return (
    (blueprint.kind !== undefined && KIND_ICONS[blueprint.kind]) ||
    iconForCategory(blueprint.category)
  );
}

/** The first sentence of a description (up to the first `.`, `!` or `?` followed by a space or the end). */
export function firstSentence(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim();
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return (match ? match[0] : text).slice(0, 1000);
}

// ── Packing ─────────────────────────────────────────────────────────────────

export interface ArtifactPackFile {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
}

export interface ArtifactPackManifest {
  format: typeof ARTIFACT_PACK_FORMAT;
  formatVersion: typeof ARTIFACT_PACK_FORMAT_VERSION;
  slug: string;
  manifestId: string;
  title: string;
  description: string;
  icon: string;
  page: { path: string; bytes: number; sha256: string };
  files: ArtifactPackFile[];
  batches: PackBatch[];
  totalBytes: number;
  /** sha256 over the dist files, the same definition as the publish ledger's. */
  buildSha256: string;
  /** Runtime capabilities to declare on publish; null unless review comments are enabled. */
  capabilities: Record<string, unknown> | null;
  /** The avatar images in the pack (one copy, `avatars/<size>/`), or null when it has none. */
  avatars: { sizes: number[]; files: number; bytes: number } | null;
  warnings: string[];
}

/** Counts the avatar images among the pack files (sizes found, files, bytes). */
export function summarizeAvatars(
  files: readonly { path: string; bytes: number }[]
): ArtifactPackManifest['avatars'] {
  const sizes = new Set<number>();
  let count = 0;
  let bytes = 0;
  for (const file of files) {
    const match = AVATAR_FILE.exec(file.path);
    if (!match) continue;
    sizes.add(Number(match[1]));
    count += 1;
    bytes += file.bytes;
  }
  return count ? { sizes: [...sizes].sort((a, b) => a - b), files: count, bytes } : null;
}

export interface PackArtifactOptions {
  /** The verified build output (`artifacts/<slug>/dist`). */
  distDir: string;
  /** Where the artifact-ready folder is written (missing, empty or a previous pack). */
  outDir: string;
  slug: string;
  manifest: { id: string; name: string; description?: string; category?: string };
  capabilities?: Record<string, unknown> | null;
  allowSourceMaps?: boolean;
  /** A deliberate static HTML page, such as the pre-rendered gallery index. */
  allowStaticPage?: boolean;
  /** Check only; write nothing. */
  dryRun?: boolean;
}

export type PackArtifactResult =
  | { ok: true; manifest: ArtifactPackManifest; outDir: string; written: boolean }
  | { ok: false; issues: PackIssue[]; warnings: string[] };

function isInsideOrSame(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function assertWritableOutDir(outDir: string, distDir: string): Promise<PackIssue | null> {
  if (isInsideOrSame(outDir, distDir) || isInsideOrSame(distDir, outDir)) {
    return {
      path: outDir,
      reason: 'the pack folder must not contain, or be inside, the build folder',
    };
  }
  if (!existsSync(outDir)) return null;
  const entries = await readdir(outDir);
  if (!entries.length) return null;
  try {
    const previous = JSON.parse(await readFile(join(outDir, ARTIFACT_MANIFEST), 'utf8')) as {
      format?: string;
    };
    if (previous.format === ARTIFACT_PACK_FORMAT) return null;
  } catch {
    // Not a previous pack: refuse below.
  }
  return {
    path: outDir,
    reason: `the folder is not empty and holds no ${ARTIFACT_MANIFEST} from a previous pack; refusing to replace it`,
  };
}

/** Packs `distDir` into `outDir`; on any issue nothing is written. */
export async function packArtifact(options: PackArtifactOptions): Promise<PackArtifactResult> {
  const distDir = resolve(options.distDir);
  const outDir = resolve(options.outDir);
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    return {
      ok: false,
      issues: [
        { path: 'index.html', reason: `no index.html in ${distDir}; build the prototype first` },
      ],
      warnings: [],
    };
  }

  const digests: FileDigest[] = await digestDirectory(distDir);
  const transformed = transformPage(await readFile(indexPath, 'utf8'), {
    allowStaticPage: options.allowStaticPage,
  });
  const issues: PackIssue[] = [...transformed.issues];
  const warnings: string[] = [...transformed.warnings];
  const files: ArtifactPackFile[] = [];
  /** Text files whose packed content differs from dist (escaped U+FFFD). */
  const rewritten = new Map<string, string>();

  for (const digest of digests) {
    if (digest.path === 'index.html') continue;
    const kind = contentTypeFor(digest.path, { allowSourceMaps: options.allowSourceMaps });
    if (!kind) {
      issues.push({
        path: digest.path,
        reason: /\.map$/i.test(digest.path)
          ? 'source maps are not published by default (pass allowSourceMaps to include them)'
          : 'not a standard web media type the Artifact accepts',
      });
      continue;
    }
    if (/(?:^|\/)(?:sw|service-worker)\.js$/i.test(digest.path)) {
      issues.push({
        path: digest.path,
        reason: 'a service worker file; build without offline support',
      });
    }
    const limit = kind.text ? ARTIFACT_LIMITS.textFileBytes : ARTIFACT_LIMITS.binaryFileBytes;
    if (digest.size > limit) {
      issues.push({
        path: digest.path,
        reason: `${digest.size} bytes exceed the ${limit}-byte limit for a ${kind.text ? 'text' : 'binary'} file`,
      });
    }
    let packed: string | null = null;
    if (kind.text) {
      const text = await readFile(join(distDir, digest.path), 'utf8');
      issues.push(...checkTextAsset(digest.path, text));
      packed = escapeReplacementCharacters(digest.path, text);
      if (packed === null && text.includes('�')) {
        issues.push({
          path: digest.path,
          reason: 'contains the replacement character U+FFFD, which the Artifact refuses',
        });
      }
    }
    if (packed !== null) rewritten.set(digest.path, packed);
    files.push({
      path: digest.path,
      bytes: packed === null ? digest.size : Buffer.byteLength(packed),
      sha256: packed === null ? digest.sha256 : sha256Text(packed),
      contentType: kind.type,
    });
  }

  const present = new Set(files.map((file) => file.path));
  for (const path of transformed.references) {
    if (!present.has(path)) {
      issues.push({
        path: ARTIFACT_PAGE,
        reason: `references "${path}", which is not in the build`,
      });
    }
  }

  const pageBytes = Buffer.byteLength(transformed.page);
  if (pageBytes > ARTIFACT_LIMITS.textFileBytes) {
    issues.push({ path: ARTIFACT_PAGE, reason: `${pageBytes} bytes exceed the page limit` });
  }
  const planned = planBatches(pageBytes, files);
  issues.push(...planned.issues);

  const outIssue = await assertWritableOutDir(outDir, distDir);
  if (outIssue) issues.push(outIssue);
  if (issues.length) return { ok: false, issues, warnings };

  const manifest: ArtifactPackManifest = {
    format: ARTIFACT_PACK_FORMAT,
    formatVersion: ARTIFACT_PACK_FORMAT_VERSION,
    slug: options.slug,
    manifestId: options.manifest.id,
    title: transformed.title,
    description: firstSentence(options.manifest.description || options.manifest.name),
    icon: iconForCategory(options.manifest.category),
    page: { path: ARTIFACT_PAGE, bytes: pageBytes, sha256: sha256Text(transformed.page) },
    files,
    batches: planned.batches,
    totalBytes: pageBytes + files.reduce((sum, file) => sum + file.bytes, 0),
    buildSha256: buildDigest(digests),
    capabilities: options.capabilities ?? null,
    avatars: summarizeAvatars(files),
    warnings,
  };
  if (options.dryRun) return { ok: true, manifest, outDir, written: false };

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, ARTIFACT_PAGE), transformed.page);
  for (const file of files) {
    const target = join(outDir, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    const packed = rewritten.get(file.path);
    if (packed === undefined) await copyFile(join(distDir, ...file.path.split('/')), target);
    else await writeFile(target, packed);
  }
  await writeFile(join(outDir, ARTIFACT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ok: true, manifest, outDir, written: true };
}

/**
 * The Artifact tool's publish arguments for one batch: the page and its first
 * files on batch 1, later batches as further publishes to the same URL.
 */
export function publishArguments(
  manifest: ArtifactPackManifest,
  outDir: string,
  batchIndex = 1
): {
  file_path: string;
  files: Record<string, string>;
  icon: string;
  description: string;
  capabilities?: Record<string, unknown>;
} {
  const batch = manifest.batches.find((entry) => entry.index === batchIndex);
  if (!batch)
    throw new RangeError(`No batch ${batchIndex}; the pack has ${manifest.batches.length}`);
  const root = resolve(outDir);
  return {
    file_path: join(root, manifest.page.path),
    files: Object.fromEntries(batch.files.map((path) => [path, join(root, ...path.split('/'))])),
    icon: manifest.icon,
    description: manifest.description,
    ...(manifest.capabilities ? { capabilities: manifest.capabilities } : {}),
  };
}
