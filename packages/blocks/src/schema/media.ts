import { isAvatarId } from '@protoyard/avatars';
import { z } from 'zod';

/**
 * Media sources (ADR-037). A block never loads remote media:
 *
 * - `avatar:av-007` — a portrait from `@protoyard/avatars`, shipped with every build;
 * - `data:image/png;base64,…` — an embedded raster image (png, jpeg, webp, gif)
 *   or video (mp4, webm), at most 192 KB decoded;
 * - `assets/cover.webp` — a safe relative path accepted by the schema; the
 *   active host resolves it from its own origin.
 *
 * SVG, `https:`, protocol-relative URLs, other schemes and `..` segments are
 * never accepted.
 */

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

function mediaSource(media: MediaKind) {
  return z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
      const result = classifyMediaSource(value, media);
      if (!result.ok) ctx.addIssue({ code: 'custom', message: result.message });
    });
}

export const ImageSourceSchema = mediaSource('image');
export const VideoSourceSchema = mediaSource('video');

/** An avatar id on its own (`av-007`), for people and quotes. */
export const AvatarIdSchema = z
  .string()
  .refine(isAvatarId, { message: 'Use an avatar id from av-001 to av-175' });
