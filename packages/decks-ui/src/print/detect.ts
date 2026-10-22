/**
 * Print mode flags from the URL (and helpers for print-only DOM).
 * `?print=1` enters print layout; `&notes=1` includes speaker notes.
 */

export interface DeckPrintFlags {
  /** Render the one-slide-per-page print layout. */
  print: boolean;
  /** Include speaker notes under each slide when printing. */
  notes: boolean;
}

/** True for common truthy query values (`1`, `true`, `yes`, empty flag). */
function flagOn(value: string | null): boolean {
  if (value === null) return false;
  const v = value.trim().toLowerCase();
  return v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Reads print flags from a query string (`?print=1&notes=1`) or a
 * `URLSearchParams` / `location.search` value.
 */
export function parseDeckPrintFlags(
  search: string | URLSearchParams | undefined | null = typeof location !== 'undefined'
    ? location.search
    : ''
): DeckPrintFlags {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : (search ?? new URLSearchParams());
  return {
    print: flagOn(params.get('print')),
    notes: flagOn(params.get('notes')),
  };
}

/** Build a search string that enters print mode (preserves other params). */
export function deckPrintSearch(
  options: { notes?: boolean; base?: string | URLSearchParams } = {}
): string {
  const params =
    typeof options.base === 'string'
      ? new URLSearchParams(options.base.startsWith('?') ? options.base.slice(1) : options.base)
      : options.base
        ? new URLSearchParams(options.base)
        : new URLSearchParams();
  params.set('print', '1');
  if (options.notes) params.set('notes', '1');
  else params.delete('notes');
  const text = params.toString();
  return text ? `?${text}` : '?print=1';
}
