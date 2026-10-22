/**
 * Stepped line highlights for code blocks. A step is either a line spec
 * string (`"1-2,4"`, the code block schema's form) or a list of line numbers
 * and `[start, end]` ranges (`[[1, 2], 4]`). Lines are 1-based.
 */

export type HighlightStep = string | readonly (number | readonly [number, number])[];

const LINE_SPEC = /^\d{1,4}(?:-\d{1,4})?(?:,\d{1,4}(?:-\d{1,4})?)*$/;

/** Parses `"1-2,4"` into `[[1, 2], [4, 4]]`, or `null` when malformed or reversed. */
export function parseLineSpec(spec: string): [number, number][] | null {
  if (!LINE_SPEC.test(spec)) return null;
  const ranges: [number, number][] = [];
  for (const part of spec.split(',')) {
    const [a, b = a] = part.split('-').map(Number) as [number, number?];
    if (a < 1 || (b as number) < a) return null;
    ranges.push([a, b as number]);
  }
  return ranges;
}

function rangesOf(step: HighlightStep): [number, number][] | null {
  if (typeof step === 'string') return parseLineSpec(step);
  if (!Array.isArray(step)) return null;
  const ranges: [number, number][] = [];
  for (const item of step) {
    if (typeof item === 'number') {
      if (!Number.isInteger(item) || item < 1) return null;
      ranges.push([item, item]);
    } else if (Array.isArray(item) && item.length === 2) {
      const [a, b] = item;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) return null;
      ranges.push([a, b]);
    } else {
      return null;
    }
  }
  return ranges;
}

/**
 * The highlighted lines of every step: sorted, unique, clamped to
 * `lineCount`. A malformed step highlights nothing rather than everything.
 */
export function resolveHighlightSteps(
  steps: readonly HighlightStep[],
  lineCount: number
): number[][] {
  const max = Math.max(0, Math.floor(lineCount));
  return steps.map((step) => {
    const ranges = rangesOf(step);
    if (!ranges) return [];
    const lines = new Set<number>();
    for (const [start, end] of ranges) {
      for (let line = start; line <= Math.min(end, max); line += 1) lines.add(line);
    }
    return [...lines].sort((a, b) => a - b);
  });
}

/** Lines in a piece of code, counting a trailing empty line like editors do. */
export function countCodeLines(code: string): number {
  return code.split('\n').length;
}
