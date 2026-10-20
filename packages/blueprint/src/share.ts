import { canonicalJson } from './identity.ts';
import type { Blueprint } from './schema.ts';
import {
  DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS,
  loadUntrustedBlueprint,
  type UntrustedBlueprintIssue,
} from './untrusted.ts';

/**
 * Share links (ADR-030): a blueprint travels in a URL fragment, `#bp=1.<data>`,
 * where `<data>` is the canonical JSON, deflate-raw compressed, in base64url.
 * Fragments never reach a server. Decoding treats the link as untrusted:
 * size caps apply before any work, decompression stops at the loader's byte
 * cap (no zip bombs), and the text goes through `loadUntrustedBlueprint`.
 *
 * Uses `CompressionStream` / `DecompressionStream` (browsers, Node 20+).
 */

/** Version prefix of the current share format. */
export const SHARE_LINK_VERSION = '1';
/** The fragment parameter a player reads: `#bp=<encoded>`. */
export const SHARE_FRAGMENT_PARAM = 'bp';
/** Encoded links longer than this are refused (they stop fitting chat tools). */
export const MAX_SHARE_ENCODED_LENGTH = 16 * 1024;
/** Decompression stops past this many bytes: the untrusted loader's input cap. */
export const MAX_SHARE_DECODED_BYTES = DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes;

const PREFIX = `${SHARE_LINK_VERSION}.`;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

export type ShareLinkIssue = Omit<UntrustedBlueprintIssue, 'code'> & {
  code: UntrustedBlueprintIssue['code'] | 'invalid-link' | 'unsupported-version';
};

export type ShareDecodeResult =
  | { success: true; blueprint: Blueprint; issues: [] }
  | { success: false; blueprint: null; issues: ShareLinkIssue[] };

/** Thrown by `encodeBlueprintShare` when a blueprint does not fit in a link. */
export class ShareLinkTooLargeError extends Error {
  readonly encodedLength: number;
  constructor(encodedLength: number) {
    super(
      `This blueprint needs a ${encodedLength}-character link; links are limited to ${MAX_SHARE_ENCODED_LENGTH}. Share the blueprint.json file instead.`
    );
    this.name = 'ShareLinkTooLargeError';
    this.encodedLength = encodedLength;
  }
}

const fail = (code: ShareLinkIssue['code'], message: string, fix: string): ShareDecodeResult => ({
  success: false,
  blueprint: null,
  issues: [{ code, path: [], message, fix }],
});

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  cap: number
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length % 4 === 1) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Encodes a blueprint as `1.<base64url(deflate-raw(canonical JSON))>`. The same
 * blueprint always gives the same link, whatever its key order. Throws
 * `ShareLinkTooLargeError` past `MAX_SHARE_ENCODED_LENGTH`.
 */
export async function encodeBlueprintShare(blueprint: Blueprint): Promise<string> {
  const { $schema: _schema, ...content } = blueprint;
  const json = new TextEncoder().encode(canonicalJson(content));
  const compressed = await collect(
    streamOf(json).pipeThrough(new CompressionStream('deflate-raw')),
    Number.POSITIVE_INFINITY
  );
  const encoded = `${PREFIX}${toBase64Url(compressed ?? new Uint8Array())}`;
  if (encoded.length > MAX_SHARE_ENCODED_LENGTH) throw new ShareLinkTooLargeError(encoded.length);
  return encoded;
}

/** `#bp=<encoded>`, ready to append to the player's URL. */
export function blueprintShareFragment(encoded: string): string {
  return `#${SHARE_FRAGMENT_PARAM}=${encoded}`;
}

/**
 * The encoded blueprint in a URL fragment (`#bp=…`, alone or among other
 * `&`-separated parameters), or null when there is none.
 */
export function readBlueprintShareFragment(hash: string): string | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of body.split('&')) {
    const [key, ...rest] = part.split('=');
    if (key === SHARE_FRAGMENT_PARAM) return rest.join('=');
  }
  return null;
}

/**
 * Decodes a share link payload (`1.<data>`, or a whole `#bp=` fragment) into a
 * validated blueprint or typed issues. Never throws.
 */
export async function decodeBlueprintShare(input: string): Promise<ShareDecodeResult> {
  try {
    const raw = typeof input === 'string' ? input.trim() : '';
    const encoded = raw.startsWith('#') ? (readBlueprintShareFragment(raw) ?? '') : raw;
    if (encoded.length > MAX_SHARE_ENCODED_LENGTH) {
      return fail(
        'too-large',
        `The link is ${encoded.length} characters; share links are limited to ${MAX_SHARE_ENCODED_LENGTH}.`,
        'Open the blueprint.json file instead of a link.'
      );
    }
    const dot = encoded.indexOf('.');
    if (dot < 1) {
      return fail(
        'invalid-link',
        'The link has no format version.',
        'Copy the whole link, including the part after "#bp=".'
      );
    }
    const version = encoded.slice(0, dot);
    if (version !== SHARE_LINK_VERSION) {
      return fail(
        'unsupported-version',
        `The link uses share format "${version.slice(0, 8)}"; this player reads format ${SHARE_LINK_VERSION}.`,
        'Open the link in a newer player, or share the blueprint.json file.'
      );
    }
    const data = encoded.slice(dot + 1);
    const bytes = BASE64URL.test(data) && data.length > 0 ? fromBase64Url(data) : null;
    if (!bytes) {
      return fail(
        'invalid-link',
        'The link is not valid base64url data.',
        'Copy the whole link again; it may have been cut or changed.'
      );
    }
    let inflated: Uint8Array | null;
    try {
      inflated = await collect(
        streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')),
        MAX_SHARE_DECODED_BYTES
      );
    } catch {
      return fail(
        'invalid-link',
        'The link data could not be decompressed.',
        'Copy the whole link again; it may have been cut or changed.'
      );
    }
    if (!inflated) {
      return fail(
        'too-large',
        `The blueprint in this link is larger than ${MAX_SHARE_DECODED_BYTES} bytes.`,
        'Open the blueprint.json file instead of a link.'
      );
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
    } catch {
      return fail('invalid-link', 'The link data is not UTF-8 text.', 'Copy the whole link again.');
    }
    return loadUntrustedBlueprint(text);
  } catch {
    return fail(
      'invalid-link',
      'The link could not be read.',
      'Copy the whole link again, or open the blueprint.json file.'
    );
  }
}
