import { z } from 'zod';
import { type GridColumnDef, normalize, readValue } from './columns.ts';

export const SortSchema = z
  .array(z.strictObject({ key: z.string().min(1).max(64), direction: z.enum(['asc', 'desc']) }))
  .max(8);
/** Sort keys in priority order. */
export type GridSort = z.infer<typeof SortSchema>;

export interface CompareOptions {
  /** Locale for text order (default `en`, never the system locale, so order is stable). */
  locale?: string;
}

const collators = new Map<string, Intl.Collator>();

function collator(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    collators.set(locale, c);
  }
  return c;
}

/** Compares normalized values; empty values (`null`) always sort last. */
export function compareNormalized(
  a: string | number | null,
  b: string | number | null,
  locale = 'en'
): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator(locale).compare(String(a), String(b));
}

/**
 * Stable multi-key sort; returns a new array. Keys that are not columns are
 * ignored. Each row's values are read once, so 100,000 rows sort quickly.
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: GridSort,
  columns: readonly GridColumnDef<T>[],
  options: CompareOptions = {}
): T[] {
  const keys = sort
    .map((entry) => ({
      column: columns.find((column) => column.key === entry.key),
      sign: entry.direction === 'desc' ? -1 : 1,
    }))
    .filter(
      (entry): entry is { column: GridColumnDef<T>; sign: number } => entry.column !== undefined
    );
  if (keys.length === 0) return [...rows];
  const locale = options.locale ?? 'en';
  // Each key becomes an integer rank per row: 0 is first in the key's direction,
  // and empty values take the last rank in both directions.
  const ranks = keys.map(({ column, sign }) => {
    const values = rows.map((row) => normalize(readValue(row, column), column.type));
    const ranked =
      column.type === 'text' || column.type === 'enum'
        ? rankTexts(values, locale)
        : rankNumbers(values);
    const perRow = ranked.perRow.map((r) =>
      r === ranked.size ? r : sign < 0 ? ranked.size - 1 - r : r
    );
    return { perRow, radix: ranked.size + 1 };
  });
  const n = rows.length;
  // Mixed-radix key per row, times n plus the row index (for stability), sorted natively.
  const span = ranks.reduce((product, { radix }) => product * radix, 1) * n;
  if (span < Number.MAX_SAFE_INTEGER) {
    const packed = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let key = 0;
      for (const { perRow, radix } of ranks) key = key * radix + (perRow[i] as number);
      packed[i] = key * n + i;
    }
    packed.sort();
    return Array.from(packed, (key) => rows[key % n] as T);
  }
  const order = rows.map((_, index) => index);
  order.sort((a, b) => {
    for (const { perRow } of ranks) {
      const diff = (perRow[a] as number) - (perRow[b] as number);
      if (diff !== 0) return diff;
    }
    return a - b;
  });
  return order.map((index) => rows[index] as T);
}

interface Ranked {
  /** Rank per row; `size` marks an empty value. */
  perRow: number[];
  /** Number of distinct ranks. */
  size: number;
}

function rankNumbers(values: readonly (string | number | null)[]): Ranked {
  const sorted = Float64Array.from(values.filter((v): v is number => typeof v === 'number')).sort();
  let size = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i] !== sorted[i - 1]) sorted[size++] = sorted[i] as number;
  }
  const perRow = values.map((v) => {
    if (typeof v !== 'number') return size;
    let low = 0;
    let high = size - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((sorted[middle] as number) < v) low = middle + 1;
      else high = middle;
    }
    return low;
  });
  return { perRow, size };
}

/** Above this many distinct values, text sorts by a fast folded key instead of the collator. */
export const EXACT_COLLATION_LIMIT = 5000;

/**
 * A sort key that folds case and accents and pads digit runs ("Deal 9" before
 * "Deal 10"), compared by code unit: the collator's order for Latin text, at
 * native speed. Other scripts keep their code-point order.
 */
export function foldedKey(text: string): string {
  // ASCII has no accents to fold, and skipping NFD keeps 100,000 keys fast.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range check
  const folded = /^[\x00-\x7f]*$/.test(text) ? text : text.normalize('NFD').replace(/\p{M}+/gu, '');
  return folded
    .toLowerCase()
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, '').padStart(16, '0'));
}

function rankTexts(values: readonly (string | number | null)[], locale: string): Ranked {
  const distinct = [...new Set(values.filter((v): v is string => typeof v === 'string'))];
  const rankOf = new Map<string, number>();
  let size = 0;
  if (distinct.length <= EXACT_COLLATION_LIMIT) {
    const compare = collator(locale).compare;
    distinct.sort(compare);
    distinct.forEach((value, i) => {
      // Values the collator calls equal ("Acme" / "acme") share a rank.
      if (i === 0 || compare(distinct[i - 1] as string, value) !== 0) size++;
      rankOf.set(value, size - 1);
    });
  } else {
    const byKey = new Map<string, string[]>();
    for (const value of distinct) {
      const key = foldedKey(value);
      const list = byKey.get(key);
      if (list) list.push(value);
      else byKey.set(key, [value]);
    }
    for (const key of [...byKey.keys()].sort()) {
      for (const value of byKey.get(key) as string[]) rankOf.set(value, size);
      size++;
    }
  }
  return {
    perRow: values.map((v) => (typeof v === 'string' ? (rankOf.get(v) as number) : size)),
    size,
  };
}
