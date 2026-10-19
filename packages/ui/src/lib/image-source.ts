/**
 * Image sources an `<img>` may load from data that could come from a
 * snapshot: `https://…`, a root-relative `/path` (never `//host`) or a
 * relative path (`./avatars/64/av-001.webp`, what relocatable builds use).
 * Any other scheme (`javascript:`, `data:`, `http:`, `blob:`…), whitespace,
 * quotes, backslashes or control characters are refused.
 */
export function isSafeImageSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (/[\s\u0000-\u001f\u007f"'<>\\`]/.test(value)) return false;
  if (value.startsWith('//')) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  return scheme === null || scheme[1]?.toLowerCase() === 'https';
}

/**
 * A `srcset` whose every candidate URL is a safe image source, else
 * undefined (the plain `src` still shows).
 */
export function safeSrcset(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const candidates = value.split(',').map((part) => part.trim());
  const ok = candidates.every((candidate) => {
    const [url, descriptor, ...extra] = candidate.split(' ').filter(Boolean);
    return (
      extra.length === 0 &&
      isSafeImageSource(url) &&
      (descriptor === undefined || /^\d+(\.\d+)?[xw]$/.test(descriptor))
    );
  });
  return ok ? value : undefined;
}
