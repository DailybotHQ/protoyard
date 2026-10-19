/// <reference path="./env.d.ts" />

import { isPersonaAvatar } from '@protoyard/core';

/**
 * Avatar ids (`av-001` … `av-175`, the @protoyard/avatars library) → image
 * URLs. The renderer's Vite config emits the images into every build under
 * `avatars/<size>/<id>.webp` (deterministic names) and defines
 * `__PROTOYARD_AVATARS__` with the folder they are served from:
 *
 * - a standalone build: `<base>avatars/` (`./avatars/` for the relocatable
 *   base, so exports and Claude artifacts keep working anywhere);
 * - a showcase app: the shared `PROTOYARD_AVATAR_BASE` (one copy at the site root);
 * - an artifact pack: 128 px only, so 64 px requests resolve to 128 px.
 *
 * The id rules mirror `@protoyard/avatars` (kept in sync by a test) so this
 * module adds no dependency and no manifest to a prototype's JavaScript.
 */

export type AvatarImageSize = 64 | 128;

export interface AvatarUrlOptions {
  /** Folder that holds `<size>/<id>.webp`, ending in `/`. Default: the build's avatar base. */
  base?: string;
  /** Sizes the build ships. Default: the build's sizes (`[]` when avatars are turned off). */
  sizes?: readonly AvatarImageSize[];
}

/** Number of avatars in the library; matches `AVATAR_COUNT` in @protoyard/avatars. */
const AVATAR_COUNT = 175;
const ID_PATTERN = /^av-(\d{3})$/;
const ALL_SIZES: readonly AvatarImageSize[] = [64, 128];

const BUILD_AVATARS: { base: string; sizes: readonly AvatarImageSize[] } =
  typeof __PROTOYARD_AVATARS__ !== 'undefined'
    ? __PROTOYARD_AVATARS__
    : { base: './avatars/', sizes: ALL_SIZES };

/** The folder this build serves avatars from (for example `./avatars/` or `/avatars/`). */
export const AVATAR_BASE: string = BUILD_AVATARS.base;

/** True when `value` is one of the library's avatar ids. */
export function isAvatarId(value: unknown): value is `av-${string}` {
  if (typeof value !== 'string') return false;
  const match = ID_PATTERN.exec(value);
  if (!match) return false;
  const n = Number(match[1]);
  return n >= 1 && n <= AVATAR_COUNT;
}

/**
 * A URL avatar as the persona contract accepts it: `https://…` or
 * root-relative `/…` (not protocol-relative `//…`). Anything else (data:,
 * javascript:, http:, relative paths) is refused.
 */
export function isAvatarUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  // No whitespace, control characters, quotes or backslashes anywhere.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (/[\s\u0000-\u001f\u007f"'<>\\`]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (!value.startsWith('https://')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function withSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

/** The closest shipped size at or above `size`, else the largest shipped one. */
function shippedSize(
  size: AvatarImageSize,
  sizes: readonly AvatarImageSize[]
): AvatarImageSize | undefined {
  const sorted = [...sizes].sort((a, b) => a - b);
  return sorted.find((s) => s >= size) ?? sorted[sorted.length - 1];
}

/**
 * The image URL for a persona or record avatar. An avatar id resolves to
 * `<base><size>/<id>.webp`; a URL avatar (https or root-relative) passes
 * through unchanged; anything else, a missing value, or a build without
 * avatars gives `undefined` (render initials instead).
 */
export function avatarUrl(
  avatar: string | null | undefined,
  size: AvatarImageSize = 128,
  options: AvatarUrlOptions = {}
): string | undefined {
  if (avatar === null || avatar === undefined) return undefined;
  if (isAvatarId(avatar)) {
    const shipped = shippedSize(size, options.sizes ?? BUILD_AVATARS.sizes);
    if (shipped === undefined) return undefined;
    return `${withSlash(options.base ?? BUILD_AVATARS.base)}${shipped}/${avatar}.webp`;
  }
  return isAvatarUrl(avatar) ? avatar : undefined;
}

/**
 * `srcset` for an avatar id: 64 px at 1x and 128 px at 2x. Undefined for URL
 * avatars (one image) and when the build ships a single size (an artifact
 * pack ships 128 px only, which `avatarUrl` already returns).
 */
export function avatarSrcset(
  avatar: string | null | undefined,
  options: AvatarUrlOptions = {}
): string | undefined {
  if (!isAvatarId(avatar)) return undefined;
  const sizes = options.sizes ?? BUILD_AVATARS.sizes;
  if (!sizes.includes(64) || !sizes.includes(128)) return undefined;
  return `${avatarUrl(avatar, 64, options)} 1x, ${avatarUrl(avatar, 128, options)} 2x`;
}

/** What `<Avatar>` from `@protoyard/ui` takes to show a face (`{}` when there is none). */
export interface AvatarImage {
  src?: string;
  srcset?: string;
}

/**
 * Image props for a persona's (or person record's) `avatar`, ready to spread
 * on `@protoyard/ui`'s `Avatar`:
 *
 * ```svelte
 * <Avatar name={persona.name} {...avatarImage(persona.avatar)} />
 * ```
 *
 * The value is re-checked with `isPersonaAvatar` (snapshot imports do not
 * re-validate personas), then resolved like `avatarUrl` (64 px, 128 px at 2x).
 * Anything missing, unsafe or unknown gives `{}`, so the initials show.
 */
export function avatarImage(avatar: unknown, options: AvatarUrlOptions = {}): AvatarImage {
  if (!isPersonaAvatar(avatar)) return {};
  const src = avatarUrl(avatar, 64, options);
  if (src === undefined) return {};
  const srcset = avatarSrcset(avatar, options);
  return srcset === undefined ? { src } : { src, srcset };
}
