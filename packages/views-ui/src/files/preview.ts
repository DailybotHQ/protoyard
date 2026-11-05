/**
 * Pure helpers for `FilePreview`: which preview a file gets, which URLs may
 * reach `src`, and how much text is shown.
 */
import { categoryOf, type FileEntry } from '@protoyard/views/files';

/** How the lightbox shows a file. */
export type FilePreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'other';

/** Text previews stop after this many characters (the rest is noted, not rendered). */
export const MAX_PREVIEW_TEXT = 100_000;

/** The preview a file gets in the lightbox (folders and archives get `other`). */
export function previewKind(entry: Pick<FileEntry, 'kind' | 'type' | 'name'>): FilePreviewKind {
  const category = categoryOf(entry);
  if (
    category === 'image' ||
    category === 'pdf' ||
    category === 'text' ||
    category === 'video' ||
    category === 'audio'
  ) {
    return category;
  }
  return 'other';
}

const RASTER_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A URL the preview may load, or `undefined`. Developer trust, like Texuli's
 * file browser: `https:`, `http:`, `blob:` and same-origin relative paths;
 * base64 raster `data:` images only for images. Everything else
 * (`javascript:`, `data:` documents, protocol-relative `//host`) is refused.
 */
export function safePreviewSrc(raw: string | undefined, kind: FilePreviewKind): string | undefined {
  if (typeof raw !== 'string') return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
  const url = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  if (!url) return undefined;
  if (/^[/\\]{2}/.test(url.replace(/\\/g, '/'))) return undefined;
  if (/^(?:https?|blob):/i.test(url)) return url;
  if (/^data:/i.test(url)) return kind === 'image' && RASTER_DATA.test(url) ? url : undefined;
  if (HAS_SCHEME.test(url)) return undefined;
  return url;
}

/** Text clipped to `MAX_PREVIEW_TEXT`, with how many characters were left out. */
export function clipPreviewText(text: string): { text: string; omitted: number } {
  if (text.length <= MAX_PREVIEW_TEXT) return { text, omitted: 0 };
  return { text: text.slice(0, MAX_PREVIEW_TEXT), omitted: text.length - MAX_PREVIEW_TEXT };
}
