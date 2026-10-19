/*
 * Linear tick math: steps of 1, 2 or 5 times a power of ten. Values are built
 * as integer multiples (or integer divisions for steps below 1), so ticks such
 * as 0.3 come out exact instead of 0.30000000000000004.
 */

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/** The 1/2/5 × 10ⁿ step that splits `[start, stop]` into about `count` intervals. */
export function tickStep(start: number, stop: number, count = 10): number {
  const span = Math.abs(stop - start);
  if (!(span > 0) || !Number.isFinite(span)) return 0;
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  return factor * power;
}

/** `index × step`, computed through an integer inverse when the step is fractional. */
function multiple(index: number, step: number): number {
  const inverse = step >= 1 ? 0 : Math.round(1 / step);
  const value = inverse > 0 && Math.abs(inverse * step - 1) < 1e-9 ? index / inverse : index * step;
  // `|| 0` turns -0 (from Math.ceil(-1e-9)) into 0.
  return value || 0;
}

/** Round tick values inside `[start, stop]` (either order), ascending like the input. */
export function ticks(start: number, stop: number, count = 10): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return [];
  if (start === stop) return [start];
  const reverse = stop < start;
  const lo = reverse ? stop : start;
  const hi = reverse ? start : stop;
  const step = tickStep(lo, hi, count);
  if (step === 0) return [lo];
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  const values: number[] = [];
  for (let i = first; i <= last; i++) values.push(multiple(i, step));
  return reverse ? values.reverse() : values;
}

/** Extends `[start, stop]` outward to round tick boundaries. */
export function niceDomain(start: number, stop: number, count = 10): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start === stop) return [start, stop];
  const reverse = stop < start;
  let lo = reverse ? stop : start;
  let hi = reverse ? start : stop;
  let previous = 0;
  for (let i = 0; i < 10; i++) {
    const step = tickStep(lo, hi, count);
    if (step === previous || step === 0) break;
    lo = multiple(Math.floor(lo / step + 1e-9), step);
    hi = multiple(Math.ceil(hi / step - 1e-9), step);
    previous = step;
  }
  return reverse ? [hi, lo] : [lo, hi];
}

/** Decimal places needed to print ticks spaced `step` apart. */
export function stepPrecision(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}
