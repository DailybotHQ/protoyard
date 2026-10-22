/**
 * The media URL policy for deck backgrounds. A deck runs offline and as a
 * single-file artifact under a strict CSP (scripts and media only from the
 * page itself, `data:` and `blob:`), so a background may only name:
 *
 * - a relative path inside the export (`assets/cover.webp`, `./clips/intro.mp4`);
 * - a bounded base64 `data:` URI of a raster image or a web video;
 * - a library avatar (`avatar:av-012`).
 *
 * Everything else is refused: http(s) and protocol-relative URLs (no remote
 * media at level 1), `javascript:` and every other scheme, `blob:` (not
 * authorable), backslashes, `..` segments, control characters, and SVG (it
 * can carry script when opened on its own).
 */

/** About 1.5 MB of base64 (roughly 1.1 MB of media) per background. */
export const DECK_MEDIA_DATA_URI_MAX = 1_500_000;
export const DECK_MEDIA_PATH_MAX = 512;

export const DECK_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;
export const DECK_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;

export type DeckMediaKind = 'image' | 'video';

export type DeckMediaCheck =
  | { ok: true; src: string; source: 'path' | 'data' | 'avatar' }
  | { ok: false; reason: string };

const AVATAR = /^avatar:(av-\d{3})$/;
const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;
const PATH = /^(?:\.\/)?[A-Za-z0-9_][A-Za-z0-9_.\-/]*$/;
/**
 * C0/C1 control characters and the bidirectional overrides (U+202A-U+202E,
 * U+2066-U+2069), checked by code point so no literal one appears in source.
 */
function hasUnsafeChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return true;
  }
  return false;
}

/** Checks one background media URL against the policy. */
export function checkDeckMediaSrc(raw: unknown, kind: DeckMediaKind): DeckMediaCheck {
  if (typeof raw !== 'string' || raw.length === 0)
    return { ok: false, reason: 'Media needs a source' };
  if (hasUnsafeChar(raw))
    return { ok: false, reason: 'Media sources cannot contain control characters' };
  if (raw !== raw.trim())
    return { ok: false, reason: 'Media sources cannot start or end with spaces' };

  const avatar = AVATAR.exec(raw);
  if (avatar) {
    if (kind !== 'image') return { ok: false, reason: 'Avatars are images, not videos' };
    return { ok: true, src: raw, source: 'avatar' };
  }

  if (raw.toLowerCase().startsWith('data:')) {
    if (raw.length > DECK_MEDIA_DATA_URI_MAX) {
      return {
        ok: false,
        reason: `data: media is longer than ${DECK_MEDIA_DATA_URI_MAX} characters`,
      };
    }
    const match = DATA_URI.exec(raw);
    if (!match) return { ok: false, reason: 'Use a base64 data: URI with a media type' };
    const type = match[1] as string;
    const allowed: readonly string[] = kind === 'image' ? DECK_IMAGE_TYPES : DECK_VIDEO_TYPES;
    if (!allowed.includes(type)) {
      return {
        ok: false,
        reason: `${type} is not an allowed ${kind} type (${allowed.join(', ')})`,
      };
    }
    return { ok: true, src: raw, source: 'data' };
  }

  if (raw.length > DECK_MEDIA_PATH_MAX) {
    return { ok: false, reason: `Media paths are at most ${DECK_MEDIA_PATH_MAX} characters` };
  }
  if (raw.startsWith('//') || raw.includes('\\')) {
    return { ok: false, reason: 'Remote and protocol-relative media are not allowed' };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return {
      ok: false,
      reason: 'Only relative paths, data: URIs and avatars are allowed (no remote media)',
    };
  }
  if (!PATH.test(raw) || raw.split('/').some((segment) => segment === '..' || segment === '')) {
    return { ok: false, reason: 'Use a relative path inside the deck, without ".." segments' };
  }
  if (kind === 'image' && /\.svgz?$/i.test(raw)) {
    return {
      ok: false,
      reason: 'SVG backgrounds are not allowed; use PNG, JPEG, WebP, GIF or AVIF',
    };
  }
  return { ok: true, src: raw, source: 'path' };
}
