/** Display helpers for message blocks. Every result is shown as text. */

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/** A table cell as text: numbers localized, booleans as Yes/No, empty as an em dash. */
export function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return NUMBER.format(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value;
}

/** `1536` → `1.5 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** The host of an http(s) URL without `www.`, or the URL itself if it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** True for image MIME types the renderer may show inline (attachments are local or data: only). */
export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

/**
 * True when an attachment URL can be an `<img src>`: an inline raster image
 * or a relative path. `attachment:<id>` references are resolved by the host,
 * so they show as a named file instead.
 */
export function isInlineImageUrl(url: string): boolean {
  return url.startsWith('data:image/') || !/^[a-z][a-z0-9+.-]*:/i.test(url);
}
