import { roundCoord } from './round.ts';

/*
 * Scatter and legend marks centred on (x, y). `size` is the mark's area in
 * square pixels, so a sqrt scale on size keeps bubbles area-true and every
 * symbol type looks equally heavy at the same size.
 */

export type SymbolType = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross';

export const SYMBOL_TYPES: readonly SymbolType[] = [
  'circle',
  'square',
  'diamond',
  'triangle',
  'cross',
];

const polygon = (x: number, y: number, pts: readonly (readonly [number, number])[]) =>
  `${pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${roundCoord(x + px)},${roundCoord(y + py)}`).join('')}Z`;

export function symbolPath(type: SymbolType, x: number, y: number, size = 64): string {
  const area = Math.max(0, size);
  switch (type) {
    case 'circle': {
      const r = Math.sqrt(area / Math.PI);
      const rr = roundCoord(r);
      return `M${roundCoord(x - r)},${roundCoord(y)}A${rr},${rr},0,1,0,${roundCoord(x + r)},${roundCoord(y)}A${rr},${rr},0,1,0,${roundCoord(x - r)},${roundCoord(y)}Z`;
    }
    case 'square': {
      const h = Math.sqrt(area) / 2;
      return polygon(x, y, [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ]);
    }
    case 'diamond': {
      // A square rotated 45°: half-diagonal = side / √2 · √2 / … keeps the same area.
      const h = Math.sqrt(area / 2);
      return polygon(x, y, [
        [0, -h],
        [h, 0],
        [0, h],
        [-h, 0],
      ]);
    }
    case 'triangle': {
      // Equilateral: area = √3/4 · side².
      const side = Math.sqrt((4 * area) / Math.sqrt(3));
      const height = (side * Math.sqrt(3)) / 2;
      return polygon(x, y, [
        [0, (-2 * height) / 3],
        [side / 2, height / 3],
        [-side / 2, height / 3],
      ]);
    }
    case 'cross': {
      // Plus of five equal squares.
      const u = Math.sqrt(area / 5) / 2;
      const o = 3 * u;
      return polygon(x, y, [
        [-u, -o],
        [u, -o],
        [u, -u],
        [o, -u],
        [o, u],
        [u, u],
        [u, o],
        [-u, o],
        [-u, u],
        [-o, u],
        [-o, -u],
        [-u, -u],
      ]);
    }
  }
}
