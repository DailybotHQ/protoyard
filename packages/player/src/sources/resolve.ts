import {
  type Blueprint,
  DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS,
  decodeBlueprintShare,
  loadUntrustedBlueprint,
  readBlueprintShareFragment,
  type ShareLinkIssue,
} from '@protoyard/blueprint';

/**
 * Where the player's blueprint comes from, in a fixed order (ADR-030):
 *
 *   1. a `#bp=` share link in the fragment;
 *   2. `?src=./blueprint.json`, a same-origin relative path next to the player;
 *   3. otherwise, a picker (drag and drop or a file input).
 *
 * Every path ends in `loadUntrustedBlueprint` (share links through
 * `decodeBlueprintShare`), so size, depth, row-estimate and schema checks
 * always run, and failures come back as issues with a fix, never a throw.
 */

export type SourceKind = 'share' | 'src' | 'file';

export interface SourceIssue {
  code:
    | ShareLinkIssue['code']
    | 'unsupported-browser'
    | 'unsafe-src'
    | 'fetch-failed'
    | 'invalid-brand'
    | 'boot-failed';
  path: (string | number)[];
  message: string;
  fix: string;
}

export type ResolvedSource =
  | { kind: 'blueprint'; source: SourceKind; blueprint: Blueprint; label: string }
  | { kind: 'error'; source: SourceKind; label: string; issues: SourceIssue[] }
  | { kind: 'picker' };

export interface ResolveSourceInput {
  /** `location.hash`. */
  hash: string;
  /** `location.search`. */
  search: string;
  /** `location.href`, the base `?src` resolves against. */
  href: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Injected for tests; defaults to checking `DecompressionStream` support. */
  supportsDeflateRaw?: () => boolean;
}

const MAX_BYTES = DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes;

function issue(code: SourceIssue['code'], message: string, fix: string): SourceIssue {
  return { code, path: [], message, fix };
}

/** Share links decompress with `DecompressionStream('deflate-raw')` (Chrome 103+, Safari 16.4+, Firefox 113+). */
export function supportsDeflateRaw(): boolean {
  try {
    if (typeof DecompressionStream === 'undefined') return false;
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates `?src` and returns the URL to fetch, or a refusal. Only a relative
 * path that stays on the player's origin is accepted: no scheme, no `//host`,
 * no backslashes, no root-relative path outside the player, and a `.json`
 * file. The fetch never sends the request anywhere else.
 */
export function resolveSrcUrl(src: string, href: string): { url: URL } | { issue: SourceIssue } {
  const refuse = (message: string) => ({
    issue: issue(
      'unsafe-src',
      message,
      'Use a relative path next to the player, such as ?src=./blueprint.json, or open the file with the picker.'
    ),
  });
  const value = src.trim();
  if (value === '' || value.length > 512) return refuse('The ?src value is empty or too long.');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused on purpose.
  if (/[\u0000-\u001f\u007f\\]/.test(value))
    return refuse('The ?src value has control characters or backslashes.');
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith('//')) {
    return refuse(
      'The ?src value is an absolute URL; only a relative path on this site is allowed.'
    );
  }
  if (value.startsWith('/')) {
    return refuse(
      'The ?src value starts at the site root; use a path relative to the player (./…).'
    );
  }
  let base: URL;
  let url: URL;
  try {
    base = new URL(href);
    url = new URL(value, base);
  } catch {
    return refuse('The ?src value is not a valid path.');
  }
  if (url.origin !== base.origin) return refuse('The ?src value points to another site.');
  const baseDir = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
  if (!url.pathname.startsWith(baseDir)) {
    return refuse('The ?src value leaves the player folder.');
  }
  if (!url.pathname.toLowerCase().endsWith('.json'))
    return refuse('The ?src value must name a .json file.');
  url.hash = '';
  return { url };
}

/** Reads a response body up to `MAX_BYTES`; null when it is larger. */
async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BYTES) return null;
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > MAX_BYTES ? null : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const tooLarge = () =>
  issue(
    'too-large',
    `The blueprint is larger than ${MAX_BYTES} bytes.`,
    'Use a smaller blueprint.'
  );

/** Fetches a same-origin blueprint and loads it as untrusted input. */
export async function loadBlueprintFromSrc(
  url: URL,
  fetchImpl: typeof fetch = fetch
): Promise<{ blueprint: Blueprint } | { issues: SourceIssue[] }> {
  let response: Response;
  try {
    response = await fetchImpl(url.href, {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-cache',
    });
  } catch {
    return {
      issues: [
        issue(
          'fetch-failed',
          `Could not load ${url.pathname}.`,
          'Check that the file is next to the player and reload.'
        ),
      ],
    };
  }
  if (!response.ok) {
    return {
      issues: [
        issue(
          'fetch-failed',
          `Loading ${url.pathname} failed with HTTP ${response.status}.`,
          'Check the file name and reload.'
        ),
      ],
    };
  }
  const text = await readCapped(response);
  if (text === null) return { issues: [tooLarge()] };
  const result = loadUntrustedBlueprint(text);
  return result.success ? { blueprint: result.blueprint } : { issues: result.issues };
}

/** Reads a picked or dropped file and loads it as untrusted input. */
export async function loadBlueprintFromFile(
  file: Blob & { name?: string }
): Promise<{ blueprint: Blueprint } | { issues: SourceIssue[] }> {
  if (file.size > MAX_BYTES) return { issues: [tooLarge()] };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      issues: [issue('invalid-input', 'The file could not be read.', 'Pick the file again.')],
    };
  }
  const result = loadUntrustedBlueprint(text);
  return result.success ? { blueprint: result.blueprint } : { issues: result.issues };
}

/** Resolves the player's source in the fixed order; never throws. */
export async function resolveSource(input: ResolveSourceInput): Promise<ResolvedSource> {
  const fragment = readBlueprintShareFragment(input.hash);
  if (fragment !== null) {
    const label = 'share link';
    if (!(input.supportsDeflateRaw ?? supportsDeflateRaw)()) {
      return {
        kind: 'error',
        source: 'share',
        label,
        issues: [
          issue(
            'unsupported-browser',
            'This browser cannot open share links: it lacks DecompressionStream("deflate-raw") (Chrome 103+, Safari 16.4+, Firefox 113+).',
            'Open the link in a current browser, or ask for the blueprint.json file and open it here.'
          ),
        ],
      };
    }
    const decoded = await decodeBlueprintShare(fragment);
    return decoded.success
      ? { kind: 'blueprint', source: 'share', blueprint: decoded.blueprint, label }
      : { kind: 'error', source: 'share', label, issues: decoded.issues };
  }

  const src = new URLSearchParams(input.search).get('src');
  if (src !== null) {
    const resolved = resolveSrcUrl(src, input.href);
    if ('issue' in resolved) {
      return { kind: 'error', source: 'src', label: src.slice(0, 120), issues: [resolved.issue] };
    }
    const loaded = await loadBlueprintFromSrc(resolved.url, input.fetch ?? fetch);
    const label = resolved.url.pathname.split('/').pop() ?? 'blueprint.json';
    return 'blueprint' in loaded
      ? { kind: 'blueprint', source: 'src', blueprint: loaded.blueprint, label }
      : { kind: 'error', source: 'src', label, issues: loaded.issues };
  }

  return { kind: 'picker' };
}
