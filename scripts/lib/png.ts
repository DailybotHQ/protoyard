import { crc32, deflateSync, inflateSync } from 'node:zlib';

/*
 * The PNG handling the thumbnail and visual-sweep scripts need, with no image
 * dependency: lossless re-compression of Playwright screenshots, and a decoder
 * for 8-bit RGB/RGBA PNGs (what Chromium writes) to compare two captures.
 */

interface Chunk {
  type: string;
  data: Buffer;
}

function readChunks(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

/**
 * Lossless PNG re-compression: re-deflates the image data at level 9 and drops
 * ancillary chunks. No pixels change.
 */
export function optimizePng(png: Buffer): Buffer {
  const signature = png.subarray(0, 8);
  const chunks: Chunk[] = [];
  const idat: Buffer[] = [];
  for (const chunk of readChunks(png)) {
    if (chunk.type === 'IDAT') idat.push(chunk.data);
    else if (['IHDR', 'PLTE', 'tRNS', 'IEND'].includes(chunk.type)) chunks.push(chunk);
  }
  const image = deflateSync(inflateSync(Buffer.concat(idat)), { level: 9, memLevel: 9 });
  const encode = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const parts = [signature];
  for (const chunk of chunks) {
    if (chunk.type === 'IEND') parts.push(encode('IDAT', image));
    parts.push(encode(chunk.type, chunk.data));
  }
  const optimized = Buffer.concat(parts);
  return optimized.length < png.length ? optimized : png;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  pixels: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes a non-interlaced 8-bit RGB or RGBA PNG; throws for anything else. */
export function decodePng(png: Buffer): DecodedImage {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const chunks = readChunks(png);
  const header = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!header) throw new Error('PNG without IHDR');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [
    header[8],
    header[9],
    header[10],
    header[11],
    header[12],
  ];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(
      `unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`
    );
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(
    Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
  );
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (rows[y * stride + x - channels] as number) : 0;
      const up = y > 0 ? (rows[(y - 1) * stride + x] as number) : 0;
      const upLeft = y > 0 && x >= channels ? (rows[(y - 1) * stride + x - channels] as number) : 0;
      const value = line[x] as number;
      let out: number;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + left;
          break;
        case 2:
          out = value + up;
          break;
        case 3:
          out = value + ((left + up) >> 1);
          break;
        case 4:
          out = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      rows[y * stride + x] = out & 0xff;
    }
  }
  if (channels === 4) return { width, height, pixels: new Uint8Array(rows) };
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    pixels[j] = rows[i] as number;
    pixels[j + 1] = rows[i + 1] as number;
    pixels[j + 2] = rows[i + 2] as number;
    pixels[j + 3] = 255;
  }
  return { width, height, pixels };
}

/** How many pixels differ between two images (any channel); `null` when the sizes differ. */
export function changedPixels(a: DecodedImage, b: DecodedImage): number | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  let changed = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (
      a.pixels[i] !== b.pixels[i] ||
      a.pixels[i + 1] !== b.pixels[i + 1] ||
      a.pixels[i + 2] !== b.pixels[i + 2] ||
      a.pixels[i + 3] !== b.pixels[i + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}
