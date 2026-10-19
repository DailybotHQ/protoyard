/**
 * @protoyard/avatars — 175 portraits of fictional people as square WebP.
 *
 * This entry is intentionally tiny (no manifest import) so it adds almost
 * nothing to a prototype's JavaScript. The full manifest (bytes, sha256,
 * dimensions) lives in `@protoyard/avatars/manifest.json` for tooling, and
 * the images are served from `@protoyard/avatars/assets/<size>/<id>.webp`.
 */

/** Number of avatars in the library (ids `av-001` … `av-175`). */
export const AVATAR_COUNT = 175;

/** Pixel sizes shipped for every avatar: 64 (1x) and 128 (2x) for UI avatars up to 48 CSS px. */
export const AVATAR_SIZES = [64, 128] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];

/** An avatar id: `av-` plus the zero-padded source number. */
export type AvatarId = `av-${string}`;

/** Every avatar id in source order. */
export const AVATAR_IDS: readonly AvatarId[] = Object.freeze(
  Array.from({ length: AVATAR_COUNT }, (_, i): AvatarId => `av-${String(i + 1).padStart(3, '0')}`)
);

const ID_PATTERN = /^av-(\d{3})$/;

/** True when `value` is one of the library's avatar ids. */
export function isAvatarId(value: unknown): value is AvatarId {
  if (typeof value !== 'string') return false;
  const match = ID_PATTERN.exec(value);
  if (!match) return false;
  const n = Number(match[1]);
  return n >= 1 && n <= AVATAR_COUNT;
}

/** True when `value` is a shipped avatar size. */
export function isAvatarSize(value: unknown): value is AvatarSize {
  return (AVATAR_SIZES as readonly unknown[]).includes(value);
}

/**
 * Package-relative path of an avatar image, for example
 * `avatarFile('av-007', 128)` → `assets/128/av-007.webp`.
 * Throws a RangeError for an unknown id or size.
 */
export function avatarFile(id: string, size: AvatarSize = 128): string {
  if (!isAvatarId(id)) throw new RangeError(`Unknown avatar id: ${id}`);
  if (!isAvatarSize(size)) throw new RangeError(`Unsupported avatar size: ${String(size)}`);
  return `assets/${size}/${id}.webp`;
}

export {
  type AvatarPool,
  type AvatarPoolOptions,
  type AvatarRng,
  assignAvatars,
  createAvatarPool,
  pickAvatar,
} from './pick.ts';
