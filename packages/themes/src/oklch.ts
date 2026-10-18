/** A color in the perceptual OKLCH color space (D65 white point). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export type Rgb = readonly [number, number, number];

function decode(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encode(channel: number): number {
  const value = Math.min(1, Math.max(0, channel));
  return 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
}

/** Converts an sRGB byte triplet to OKLCH. */
export function rgbToOklch([red, green, blue]: Rgb): Oklch {
  const r = decode(red);
  const g = decode(green);
  const b = decode(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const axisB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, axisB);
  const hue = chroma < 1e-7 ? 0 : (Math.atan2(axisB, a) * 180) / Math.PI;
  return { l: lightness, c: chroma, h: (hue + 360) % 360 };
}

function rawOklchToLinearRgb({ l, c, h }: Oklch): Rgb {
  const angle = (h * Math.PI) / 180;
  const a = c * Math.cos(angle);
  const axisB = c * Math.sin(angle);
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * axisB;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * axisB;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * axisB;
  const lCone = lRoot ** 3;
  const mCone = mRoot ** 3;
  const sCone = sRoot ** 3;
  return [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];
}

function inGamut(rgb: Rgb): boolean {
  return rgb.every((channel) => channel >= 0 && channel <= 1);
}

/** Converts OKLCH to a hex sRGB color, reducing chroma to fit the sRGB gamut. */
export function oklchToHex(color: Oklch): string {
  const lightness = Math.min(1, Math.max(0, color.l));
  const chroma = Math.max(0, color.c);
  let rgb = rawOklchToLinearRgb({ ...color, l: lightness, c: chroma });

  if (!inGamut(rgb)) {
    let low = 0;
    let high = chroma;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const candidate = (low + high) / 2;
      const mapped = rawOklchToLinearRgb({ ...color, l: lightness, c: candidate });
      if (inGamut(mapped)) {
        low = candidate;
        rgb = mapped;
      } else {
        high = candidate;
      }
    }
  }

  return `#${rgb
    .map((channel) => Math.round(encode(channel)).toString(16).padStart(2, '0'))
    .join('')}`;
}
