import { isAvatarId } from '@protoyard/avatars';
import { z } from 'zod';
import { classifyMediaSource, type MediaKind } from '../safety.ts';

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

export type { MediaKind, MediaSourceKind } from '../safety.ts';
export { base64DecodedBytes, classifyMediaSource, MEDIA_DATA_URI_MAX_BYTES } from '../safety.ts';

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
