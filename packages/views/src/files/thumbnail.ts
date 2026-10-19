import { categoryOf, extensionOf, type FileEntry } from './model.ts';

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface ThumbnailOptions {
  /** 0–359; default comes from the id. */
  hue?: number;
  size?: number;
}

/**
 * A deterministic SVG thumbnail for an entry without a stored blob: colors
 * and shapes come only from the id (and optional hue), so it is the same on
 * every reload and seed. Images get a small landscape, others a page with the
 * extension. The only text is the sanitized extension, so the markup is safe.
 */
export function thumbnailSvg(
  entry: Pick<FileEntry, 'id' | 'kind' | 'type' | 'name'>,
  options: ThumbnailOptions = {}
): string {
  const h = hashId(entry.id);
  const hue = Math.round(options.hue ?? h % 360) % 360;
  const size = options.size ?? 96;
  const category = categoryOf(entry);
  const bg = `hsl(${hue} 55% 88%)`;
  const fg = `hsl(${hue} 45% 32%)`;
  const mid = `hsl(${(hue + 40) % 360} 50% 62%)`;
  let body: string;
  if (category === 'folder') {
    body = `<path d="M14 30h24l6 6h38v42H14z" fill="${mid}"/><path d="M14 40h68v38H14z" fill="${fg}" opacity=".85"/>`;
  } else if (category === 'image') {
    const sunX = 24 + (h % 48);
    const peak = 38 + ((h >>> 8) % 20);
    body = `<circle cx="${sunX}" cy="28" r="9" fill="${mid}"/><path d="M8 80 L34 ${peak} L52 64 L66 ${peak + 6} L88 80Z" fill="${fg}"/>`;
  } else {
    const ext =
      extensionOf(entry.name) ||
      (category === 'other' ? 'FILE' : category.toUpperCase().slice(0, 4));
    const lines = [0, 1, 2]
      .map(
        (i) =>
          `<rect x="30" y="${34 + i * 9}" width="${36 - ((h >>> (i * 4)) % 14)}" height="4" rx="2" fill="${mid}"/>`
      )
      .join('');
    body = `<path d="M24 12h34l14 14v58H24z" fill="#fff" opacity=".9"/><path d="M58 12v14h14" fill="${mid}"/>${lines}<text x="48" y="78" font-family="system-ui,sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="${fg}">${ext}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}"><rect width="96" height="96" fill="${bg}"/>${body}</svg>`;
}

/** The thumbnail as a `data:` URL for `<img src>`. */
export function thumbnailUrl(
  entry: Pick<FileEntry, 'id' | 'kind' | 'type' | 'name'>,
  options: ThumbnailOptions = {}
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(thumbnailSvg(entry, options))}`;
}
