import type { Extent } from '../types.ts';
import { ticks as linearTicks, niceDomain } from './ticks.ts';

/** A numeric scale: call it with a domain value to get a pixel position. */
export interface ContinuousScale {
  (value: number): number;
  /** Pixel position back to a domain value (crosshairs, brushing). */
  invert(position: number): number;
  ticks(count?: number): number[];
  readonly domain: Extent;
  readonly range: Extent;
}

export interface LinearScaleOptions {
  domain: Extent;
  range: Extent;
  /** Round the domain out to tick boundaries; a number sets the tick count used (default 10). */
  nice?: boolean | number;
  /** Keep output inside the range for out-of-domain input. */
  clamp?: boolean;
}

interface Transform {
  forward(value: number): number;
  backward(value: number): number;
}

const IDENTITY: Transform = { forward: (v) => v, backward: (v) => v };

function build(
  domain: Extent,
  range: Extent,
  clamp: boolean,
  transform: Transform,
  ticks: (count: number) => number[]
): ContinuousScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t0 = transform.forward(d0);
  const t1 = transform.forward(d1);
  const span = t1 - t0;
  const dLo = Math.min(d0, d1);
  const dHi = Math.max(d0, d1);
  const rLo = Math.min(r0, r1);
  const rHi = Math.max(r0, r1);

  const scale = (value: number): number => {
    // A one-value domain has no direction: put everything mid-range.
    if (span === 0) return (r0 + r1) / 2;
    const input = clamp ? Math.min(dHi, Math.max(dLo, value)) : value;
    return r0 + ((transform.forward(input) - t0) / span) * (r1 - r0);
  };
  const invert = (position: number): number => {
    if (span === 0 || r0 === r1) return d0;
    const input = clamp ? Math.min(rHi, Math.max(rLo, position)) : position;
    return transform.backward(t0 + ((input - r0) / (r1 - r0)) * span);
  };
  return Object.assign(scale, {
    invert,
    ticks: (count = 10) => ticks(count),
    domain: [d0, d1] as const,
    range: [r0, r1] as const,
  });
}

function niceCount(nice: boolean | number | undefined): number | null {
  if (nice === true) return 10;
  if (typeof nice === 'number' && nice > 0) return nice;
  return null;
}

export function linearScale(options: LinearScaleOptions): ContinuousScale {
  const count = niceCount(options.nice);
  const domain: Extent =
    count === null ? options.domain : niceDomain(options.domain[0], options.domain[1], count);
  return build(domain, options.range, options.clamp ?? false, IDENTITY, (n) =>
    linearTicks(domain[0], domain[1], n)
  );
}

/** Square-root scale: area-true bubble radii. Negative values mirror around zero. */
export function sqrtScale(options: LinearScaleOptions): ContinuousScale {
  const count = niceCount(options.nice);
  const domain: Extent =
    count === null ? options.domain : niceDomain(options.domain[0], options.domain[1], count);
  const transform: Transform = {
    forward: (v) => Math.sign(v) * Math.sqrt(Math.abs(v)),
    backward: (v) => Math.sign(v) * v * v,
  };
  return build(domain, options.range, options.clamp ?? false, transform, (n) =>
    linearTicks(domain[0], domain[1], n)
  );
}

export interface LogScaleOptions extends LinearScaleOptions {
  /** Logarithm base (default 10). */
  base?: number;
}

/**
 * Logarithmic scale. The domain must not include or cross zero (both ends
 * positive or both negative); otherwise it throws a RangeError.
 */
export function logScale(options: LogScaleOptions): ContinuousScale {
  const base = options.base ?? 10;
  if (!(base > 1)) throw new RangeError('logScale(): base must be greater than 1');
  const [a, b] = options.domain;
  if (!(a * b > 0)) {
    throw new RangeError('logScale(): the domain must be entirely positive or entirely negative');
  }
  const sign = a < 0 ? -1 : 1;
  const ln = Math.log(base);
  const log = (v: number) => (sign * Math.log(sign * v)) / ln;
  const pow = (v: number) => sign * base ** (sign * v);
  let domain: Extent = options.domain;
  if (options.nice) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const niceLo = pow(Math.floor(log(lo) + 1e-9));
    const niceHi = pow(Math.ceil(log(hi) - 1e-9));
    const [first, last] = sign > 0 ? [niceLo, niceHi] : [niceHi, niceLo];
    domain =
      a <= b
        ? [Math.min(first, last), Math.max(first, last)]
        : [Math.max(first, last), Math.min(first, last)];
  }
  const transform: Transform = { forward: log, backward: pow };
  const ticks = (count: number): number[] => logTicks(domain, base, count);
  return build(domain, options.range, options.clamp ?? false, transform, ticks);
}

/** Powers of `base` in the domain, plus 2…9 multiples when few decades are visible. */
function logTicks(domain: Extent, base: number, count: number): number[] {
  const [a, b] = domain;
  const sign = a < 0 ? -1 : 1;
  const lo = Math.min(Math.abs(a), Math.abs(b));
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const first = Math.floor(Math.log(lo) / Math.log(base) + 1e-9);
  const last = Math.ceil(Math.log(hi) / Math.log(base) - 1e-9);
  const decades = last - first;
  const values: number[] = [];
  const within = (v: number) => v >= lo * (1 - 1e-12) && v <= hi * (1 + 1e-12);
  if (decades < count / 2 && Number.isInteger(base)) {
    for (let p = first; p <= last; p++) {
      const power = base ** p;
      for (let k = 1; k < base; k++) {
        const v = round(k * power);
        if (within(v)) values.push(v);
      }
    }
  } else {
    const every = Math.max(1, Math.ceil((decades + 1) / Math.max(1, count)));
    for (let p = first; p <= last; p += every) {
      const v = round(base ** p);
      if (within(v)) values.push(v);
    }
  }
  const signed = values.map((v) => sign * v).sort((x, y) => x - y);
  return a <= b ? signed : signed.reverse();
}

/** Trims binary noise from k × 10ⁿ (0.30000000000000004 → 0.3). */
function round(value: number): number {
  return Number(value.toPrecision(12));
}
