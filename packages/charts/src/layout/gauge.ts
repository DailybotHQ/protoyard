/*
 * Gauge geometry in the same angle convention as `arcPath`: radians, 0 at
 * 12 o'clock, clockwise. Default sweep is 270° (−135° … +135°).
 */

export interface GaugeBand {
  index: number;
  from: number;
  to: number;
  startAngle: number;
  endAngle: number;
}

export interface GaugeLayout {
  /** Value clamped to [min, max]; NaN becomes min. */
  value: number;
  /** 0…1 along the sweep. */
  ratio: number;
  /** Angle of the value (needle or end of the value arc). */
  angle: number;
  track: { startAngle: number; endAngle: number };
  valueArc: { startAngle: number; endAngle: number };
  /** Threshold bands from min to max, e.g. ok / warning / critical. */
  bands: GaugeBand[];
  /** Index of the band holding the value. */
  band: number;
}

export interface GaugeOptions {
  min?: number;
  max?: number;
  startAngle?: number;
  endAngle?: number;
  /** Inner band edges between min and max, e.g. `[60, 85]` for three bands. */
  thresholds?: readonly number[];
}

export function gaugeLayout(value: number, options: GaugeOptions = {}): GaugeLayout {
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  if (!(max > min)) throw new RangeError('gaugeLayout(): max must be greater than min');
  const startAngle = options.startAngle ?? -0.75 * Math.PI;
  const endAngle = options.endAngle ?? 0.75 * Math.PI;
  const angleOf = (v: number) => startAngle + ((v - min) / (max - min)) * (endAngle - startAngle);
  const clamped = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const edges = [
    min,
    ...[...new Set(options.thresholds ?? [])]
      .filter((t) => t > min && t < max)
      .sort((a, b) => a - b),
    max,
  ];
  const bands = edges.slice(0, -1).map((from, index) => {
    const to = edges[index + 1] as number;
    return { index, from, to, startAngle: angleOf(from), endAngle: angleOf(to) };
  });
  const band = Math.max(
    0,
    bands.findIndex((b) => clamped < b.to || b.index === bands.length - 1)
  );
  const angle = angleOf(clamped);
  return {
    value: clamped,
    ratio: (clamped - min) / (max - min),
    angle,
    track: { startAngle, endAngle },
    valueArc: { startAngle, endAngle: angle },
    bands,
    band,
  };
}
