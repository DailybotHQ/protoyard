/**
 * Fractional rank keys: strings whose plain code-unit order (`<`, `Array#sort`)
 * is the card order, so a move rewrites one row instead of renumbering a column.
 *
 * A key is an integer part plus an optional fraction, in base 62
 * (`0-9A-Za-z`, already in ASCII order). The integer part's first character
 * encodes its length (`a`…`z` for 2–27 characters, `A`…`Z` for the negative
 * side), so appending or prepending thousands of cards keeps keys a few
 * characters long; only inserts between two neighbors grow the fraction.
 * Fractions never end in `0`, which keeps room on both sides of every key.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0] as string;
const TOP = DIGITS[DIGITS.length - 1] as string;
/** The lowest integer part (`A` + 26 zeros); keys below it cannot be made. */
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;

export class RankError extends Error {
  override name = 'RankError';
}

function digit(char: string): number {
  const value = DIGITS.indexOf(char);
  if (value < 0) throw new RankError(`invalid rank character "${char}"`);
  return value;
}

function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 97 + 2;
  if (head >= 'A' && head <= 'Z') return 90 - head.charCodeAt(0) + 2;
  throw new RankError(`invalid rank head "${head}"`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0] ?? '');
  if (length > key.length) throw new RankError(`rank "${key}" is shorter than its integer part`);
  return key.slice(0, length);
}

/** Throws a `RankError` unless `key` is a key this module could have produced. */
export function assertRank(key: string): void {
  if (key === SMALLEST_INTEGER) throw new RankError('the smallest integer is reserved');
  const integer = integerPart(key);
  for (const char of key) digit(char);
  if (key.length > integer.length && key.endsWith(ZERO)) {
    throw new RankError(`rank "${key}" ends in ${ZERO}`);
  }
}

/** Whether `key` is a valid rank (see `assertRank`). */
export function isRank(key: unknown): key is string {
  if (typeof key !== 'string' || key.length === 0) return false;
  try {
    assertRank(key);
    return true;
  } catch {
    return false;
  }
}

/** A fraction strictly between `a` and `b` (`b === null` is the open top). */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let shared = 0;
    while ((a[shared] ?? ZERO) === b[shared]) shared++;
    if (shared > 0) return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
  }
  const low = a ? digit(a[0] as string) : 0;
  const high = b !== null ? digit(b[0] as string) : DIGITS.length;
  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)] as string;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return (DIGITS[low] as string) + midpoint(a.slice(1), null);
}

function increment(integer: string): string | null {
  const head = integer[0] as string;
  const digits = integer.slice(1).split('');
  for (let i = digits.length - 1; i >= 0; i--) {
    const next = digit(digits[i] as string) + 1;
    if (next < DIGITS.length) {
      digits[i] = DIGITS[next] as string;
      return head + digits.join('');
    }
    digits[i] = ZERO;
  }
  if (head === 'Z') return `a${ZERO}`;
  if (head === 'z') return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (nextHead > 'a') digits.push(ZERO);
  else digits.pop();
  return nextHead + digits.join('');
}

function decrement(integer: string): string | null {
  const head = integer[0] as string;
  const digits = integer.slice(1).split('');
  for (let i = digits.length - 1; i >= 0; i--) {
    const next = digit(digits[i] as string) - 1;
    if (next >= 0) {
      digits[i] = DIGITS[next] as string;
      return head + digits.join('');
    }
    digits[i] = TOP;
  }
  if (head === 'a') return `Z${TOP}`;
  if (head === 'A') return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (nextHead < 'Z') digits.push(TOP);
  else digits.pop();
  return nextHead + digits.join('');
}

/**
 * A rank strictly between `before` and `after`. `null` means "no neighbor":
 * `rankBetween(null, null)` starts a list, `rankBetween(last, null)` appends,
 * `rankBetween(null, first)` prepends. Throws a `RankError` for invalid keys
 * or when `before >= after`.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null) assertRank(before);
  if (after !== null) assertRank(after);
  if (before !== null && after !== null && before >= after) {
    throw new RankError(`"${before}" is not below "${after}"`);
  }
  if (before === null) {
    if (after === null) return `a${ZERO}`;
    const integer = integerPart(after);
    const fraction = after.slice(integer.length);
    if (integer === SMALLEST_INTEGER) return integer + midpoint('', fraction);
    if (integer < after) return integer;
    const lower = decrement(integer);
    if (lower === null) throw new RankError('cannot rank below the smallest key');
    return lower;
  }
  const integer = integerPart(before);
  const fraction = before.slice(integer.length);
  if (after === null) return increment(integer) ?? integer + midpoint(fraction, null);
  const afterInteger = integerPart(after);
  if (integer === afterInteger) return integer + midpoint(fraction, after.slice(integer.length));
  const next = increment(integer);
  if (next === null) throw new RankError('cannot rank above the largest key');
  return next < after ? next : integer + midpoint(fraction, null);
}

/** `count` ascending ranks, all above `after` (or from the start), for seeding a list. */
export function rankSequence(count: number, after: string | null = null): string[] {
  const ranks: string[] = [];
  let previous = after;
  for (let i = 0; i < count; i++) {
    previous = rankBetween(previous, null);
    ranks.push(previous);
  }
  return ranks;
}

/** Code-unit order, the order ranks are designed for (never `localeCompare`). */
export function compareRanks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
