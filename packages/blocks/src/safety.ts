import { isAvatarId } from '@protoyard/avatars';

/**
 * Dependency-light safety predicates shared by the block schemas and the
 * untrusted-input loaders. This module imports no zod, markdown, chart or
 * catalog code, so the player's first screen can use it without pulling the
 * block schema graph (`@protoyard/blocks/safety`).
 */

// C0/C1 controls, bidi marks/embeddings/overrides/isolates ("Trojan Source"),
// BOMs, the invisible zero-width space and word joiner (U+200B, U+2060) and
// the Unicode line and paragraph separators (U+2028, U+2029). ZWJ/ZWNJ
// (U+200C, U+200D) stay: emoji and some scripts need them. This shared
// predicate also drives the untrusted-input sanitizers.
const UNSAFE_TEXT_CODE_POINT_RANGES = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x061c, 0x061c],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2060, 0x2060],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
] as const;

/**
 * Turns U+2028/U+2029 into a line break (multiline text) or a space, so the
 * untrusted loaders keep the word boundary before the schema refuses them.
 */
export function normalizeLineSeparators(value: string, keepNewlines: boolean): string {
  return value.replace(/[\u2028\u2029]/g, keepNewlines ? '\n' : ' ');
}

export function isUnsafeTextCharacter(
  character: string,
  allowNewlines = false,
  allowTabs = false
): boolean {
  const code = character.codePointAt(0) ?? 0;
  if (code === 0x0a && allowNewlines) return false;
  if (code === 0x0d && allowNewlines) return false;
  if (code === 0x09 && allowTabs) return false;
  return UNSAFE_TEXT_CODE_POINT_RANGES.some(([start, end]) => code >= start && code <= end);
}

/** Decoded bytes allowed in one `data:` source. */
export const MEDIA_DATA_URI_MAX_BYTES = 192 * 1024;
const RELATIVE_MAX_LENGTH = 512;
/** Base64 characters for the byte cap, plus the longest header. */
const DATA_URI_MAX_LENGTH = Math.ceil(MEDIA_DATA_URI_MAX_BYTES / 3) * 4 + 64;

export type MediaKind = 'image' | 'video';
export type MediaSourceKind = 'avatar' | 'data' | 'relative';

const DATA_TYPES: Record<MediaKind, readonly string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm'],
};
const EXTENSIONS: Record<MediaKind, RegExp> = {
  image: /\.(?:png|jpe?g|webp|gif|avif)$/i,
  video: /\.(?:mp4|webm)$/i,
};
// Segments start with a letter, digit or underscore, so `.`/`..` never match.
const RELATIVE = /^(?:\.\/)?(?:[A-Za-z0-9_][A-Za-z0-9._-]*\/)*[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;

/** Decoded size of a base64 payload. */
export function base64DecodedBytes(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/**
 * Classifies a media source, or explains why it is refused. Hosts use the
 * kind to apply level rules and per-document byte caps.
 */
export function classifyMediaSource(
  src: string,
  media: MediaKind
): { ok: true; kind: MediaSourceKind; bytes: number } | { ok: false; message: string } {
  if (src.startsWith('avatar:')) {
    if (media !== 'image') return { ok: false, message: 'Avatars are images, not videos' };
    return isAvatarId(src.slice('avatar:'.length))
      ? { ok: true, kind: 'avatar', bytes: 0 }
      : { ok: false, message: 'Use an avatar id from av-001 to av-175, as avatar:av-007' };
  }
  if (src.startsWith('data:')) {
    if (src.length > DATA_URI_MAX_LENGTH) {
      return {
        ok: false,
        message: `Embedded media must be at most ${MEDIA_DATA_URI_MAX_BYTES / 1024} KB`,
      };
    }
    const match = DATA_URI.exec(src);
    if (!match) return { ok: false, message: 'Use a base64 data URI, as data:image/png;base64,…' };
    const [, type = '', payload = ''] = match;
    if (!DATA_TYPES[media].includes(type)) {
      return { ok: false, message: `Embedded ${media}s must be ${DATA_TYPES[media].join(', ')}` };
    }
    if (payload.length === 0 || payload.length % 4 !== 0) {
      return { ok: false, message: 'The base64 payload is empty or malformed' };
    }
    const bytes = base64DecodedBytes(payload);
    if (bytes > MEDIA_DATA_URI_MAX_BYTES) {
      return {
        ok: false,
        message: `Embedded media must be at most ${MEDIA_DATA_URI_MAX_BYTES / 1024} KB`,
      };
    }
    return { ok: true, kind: 'data', bytes };
  }
  if (src.length <= RELATIVE_MAX_LENGTH && RELATIVE.test(src) && EXTENSIONS[media].test(src)) {
    return { ok: true, kind: 'relative', bytes: 0 };
  }
  return {
    ok: false,
    message:
      media === 'image'
        ? 'Use avatar:av-001…175, a png/jpeg/webp/gif data URI, or a relative image path (no SVG or remote URLs)'
        : 'Use an mp4/webm data URI or a relative video path (no remote URLs)',
  };
}
