import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_COUNT,
  AVATAR_IDS,
  AVATAR_SIZES,
  avatarFile,
  isAvatarId,
  isAvatarSize,
} from '../src/index.ts';

const root = join(import.meta.dirname, '..');

interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}
interface Manifest {
  name: string;
  format: string;
  count: number;
  avatars: {
    id: string;
    index: number;
    source: { file: string; sha256: string };
    files: Record<string, FileEntry>;
  }[];
}

const manifest = JSON.parse(readFileSync(join(root, 'src', 'manifest.json'), 'utf8')) as Manifest;

/** Budgets (bytes). The developer's target: 128 px ≤ 6 KB average, all assets ≤ 1.2 MB. */
const MAX_FILE: Record<number, number> = { 64: 4 * 1024, 128: 12 * 1024 };
const MAX_AVG_128 = 6 * 1024;
const MAX_TOTAL = 1.2 * 1024 * 1024;

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): { width: number; height: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
      throw new Error('bad VP8 start code');
    }
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

describe('@protoyard/avatars manifest', () => {
  it('lists 175 unique ids in source order that match the index exports', () => {
    expect(manifest.name).toBe('@protoyard/avatars');
    expect(manifest.format).toBe('webp');
    expect(manifest.count).toBe(175);
    expect(manifest.avatars).toHaveLength(AVATAR_COUNT);
    const ids = manifest.avatars.map((a) => a.id);
    expect(new Set(ids).size).toBe(175);
    expect(ids).toEqual([...AVATAR_IDS]);
    manifest.avatars.forEach((a, i) => {
      expect(a.index).toBe(i + 1);
      expect(a.source.file).toBe(`avatar${i + 1}.png`);
      expect(Object.keys(a.files).map(Number)).toEqual([...AVATAR_SIZES]);
    });
  });

  it('every file exists, matches its sha256 and bytes, and has the declared dimensions', () => {
    for (const avatar of manifest.avatars) {
      for (const size of AVATAR_SIZES) {
        const entry = avatar.files[String(size)];
        expect(entry, `${avatar.id}@${size}`).toBeDefined();
        if (!entry) continue;
        expect(entry.path).toBe(avatarFile(avatar.id, size));
        const abs = join(root, entry.path);
        expect(existsSync(abs), entry.path).toBe(true);
        const buf = readFileSync(abs);
        expect(buf.length, entry.path).toBe(entry.bytes);
        expect(createHash('sha256').update(buf).digest('hex'), entry.path).toBe(entry.sha256);
        expect(entry.width).toBe(size);
        expect(entry.height).toBe(size);
        expect(webpSize(buf), entry.path).toEqual({ width: size, height: size });
      }
    }
  });

  it('has no stray files in the asset folders', () => {
    for (const size of AVATAR_SIZES) {
      const files = readdirSync(join(root, 'assets', String(size))).sort();
      expect(files).toEqual(AVATAR_IDS.map((id) => `${id}.webp`));
    }
  });

  it('holds the per-file, average and total size budgets', () => {
    let total = 0;
    let sum128 = 0;
    for (const avatar of manifest.avatars) {
      for (const size of AVATAR_SIZES) {
        const entry = avatar.files[String(size)];
        if (!entry) throw new Error(`missing ${avatar.id}@${size}`);
        expect(entry.bytes, entry.path).toBeLessThanOrEqual(MAX_FILE[size] ?? 0);
        total += entry.bytes;
        if (size === 128) sum128 += entry.bytes;
      }
    }
    expect(sum128 / AVATAR_COUNT).toBeLessThanOrEqual(MAX_AVG_128);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL);
  });
});

describe('@protoyard/avatars helpers', () => {
  it('avatarFile builds package-relative paths and rejects unknown ids or sizes', () => {
    expect(avatarFile('av-001', 64)).toBe('assets/64/av-001.webp');
    expect(avatarFile('av-175', 128)).toBe('assets/128/av-175.webp');
    expect(avatarFile('av-042')).toBe('assets/128/av-042.webp');
    expect(() => avatarFile('av-176', 128)).toThrow(RangeError);
    expect(() => avatarFile('nope', 64)).toThrow(RangeError);
    // @ts-expect-error 256 is not a shipped size
    expect(() => avatarFile('av-001', 256)).toThrow(RangeError);
  });

  it('isAvatarId and isAvatarSize accept only library values', () => {
    expect(isAvatarId('av-001')).toBe(true);
    expect(isAvatarId('av-175')).toBe(true);
    expect(isAvatarId('av-000')).toBe(false);
    expect(isAvatarId('av-176')).toBe(false);
    expect(isAvatarId('av-1')).toBe(false);
    expect(isAvatarId('AV-001')).toBe(false);
    expect(isAvatarId(1)).toBe(false);
    expect(isAvatarId(undefined)).toBe(false);
    expect(isAvatarSize(64)).toBe(true);
    expect(isAvatarSize(128)).toBe(true);
    expect(isAvatarSize(256)).toBe(false);
    expect(isAvatarSize('64')).toBe(false);
  });
});
