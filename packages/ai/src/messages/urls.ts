import { safeHref } from '../markdown.ts';
import { MESSAGE_LIMITS } from './limits.ts';

/**
 * URL rules for chat messages. Links a person can follow (buttons, link
 * previews) are absolute http(s) or mailto only. Attachments are local: a
 * relative path inside the prototype, an `attachment:<id>` reference, or a
 * small inline raster image. Nothing a message carries makes the browser load
 * a remote resource on its own.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

function clean(url: string): boolean {
  return (
    url.length > 0 &&
    url.length <= MESSAGE_LIMITS.maxUrlLength &&
    !CONTROL.test(url) &&
    !BIDI.test(url) &&
    url.trim() === url
  );
}

/** A link a person may open in a new tab: absolute `http(s)` without credentials, or `mailto:`. */
export function isSafeLinkUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !clean(url)) return false;
  if (safeHref(url) !== url) return false;
  if (/^mailto:/i.test(url)) return /^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(url);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return !parsed.username && !parsed.password && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** A page a link preview describes: absolute `http(s)` only (never `mailto:`). */
export function isSafePreviewUrl(url: unknown): url is string {
  return isSafeLinkUrl(url) && /^https?:/i.test(url);
}

const ATTACHMENT_REF = /^attachment:[A-Za-z0-9_-]{1,64}$/;
const RASTER_DATA_URI = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decoded bytes of base64 text (no padding check beyond the regex). */
function base64Bytes(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export type AttachmentUrlIssue =
  | 'empty'
  | 'unsafe-characters'
  | 'remote'
  | 'scheme'
  | 'traversal'
  | 'data-uri-type'
  | 'data-uri-size';

/**
 * Why an attachment URL is refused, or `null` when it is allowed. Allowed:
 * `attachment:<id>`, a relative path (`files/brief.pdf`, `/assets/a.png`) with
 * no `..` segment, or `data:image/{png,jpeg,gif,webp};base64,…` within
 * `maxDataUriBytes`. Refused: any other scheme (`javascript:`, `file:`,
 * `blob:`, `data:text/html`, `data:image/svg+xml`), remote URLs (`https:`,
 * `//host`, `/\host`), and control or bidi characters.
 */
export function attachmentUrlIssue(url: unknown): AttachmentUrlIssue | null {
  if (typeof url !== 'string' || url.length === 0) return 'empty';
  if (url.length > MESSAGE_LIMITS.maxUrlLength && !url.startsWith('data:'))
    return 'unsafe-characters';
  if (CONTROL.test(url) || BIDI.test(url) || url.trim() !== url) return 'unsafe-characters';
  if (ATTACHMENT_REF.test(url)) return null;
  if (/^data:/i.test(url)) {
    const match = RASTER_DATA_URI.exec(url);
    if (!match) return 'data-uri-type';
    return base64Bytes(match[2] ?? '') > MESSAGE_LIMITS.maxDataUriBytes ? 'data-uri-size' : null;
  }
  const slashes = url.replace(/\\/g, '/');
  if (slashes.startsWith('//')) return 'remote';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return /^https?:/i.test(url) ? 'remote' : 'scheme';
  if (url.includes('\\')) return 'unsafe-characters';
  const path = url.split(/[?#]/, 1)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return 'unsafe-characters';
  }
  if (decoded.split('/').some((segment) => segment === '..')) return 'traversal';
  return null;
}

export const ATTACHMENT_URL_MESSAGES: Record<AttachmentUrlIssue, string> = {
  empty: 'An attachment needs a URL.',
  'unsafe-characters':
    'The attachment URL has control, bidi or backslash characters, or is too long.',
  remote:
    'Attachments are local: use a relative path or an attachment: reference, not a remote URL.',
  scheme: 'Only relative paths, attachment: references and inline raster images are allowed.',
  traversal: 'The attachment path must not contain a ".." segment.',
  'data-uri-type':
    'Inline attachments must be base64 PNG, JPEG, GIF or WebP images (never SVG or HTML).',
  'data-uri-size': 'The inline image is larger than the allowed size.',
};
