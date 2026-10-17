// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveThumbnails } from '../src/integrations/registry-plugin.mjs';

const root = mkdtempSync(join(tmpdir(), 'gallery-thumbs-'));
const outside = mkdtempSync(join(tmpdir(), 'gallery-outside-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
function folder(slug: string) {
  const dir = join(root, 'prototypes', slug, 'public');
  mkdirSync(dir, { recursive: true });
  return dir;
}
const entry = (slug: string, thumbnail: string, extra: Record<string, unknown> = {}) => ({
  kind: 'prototype',
  slug,
  path: `prototypes/${slug}`,
  thumbnail,
  ...extra,
});

describe('gallery thumbnails (H1/L2 regressions)', () => {
  it('publishes a regular image inside the prototype folder', () => {
    writeFileSync(join(folder('good'), 'thumbnail.png'), PNG);
    const result = resolveThumbnails(root, [entry('good', 'public/thumbnail.png')]);
    expect(result.get('prototype:good')?.file).toBe('prototype-good.png');
  });

  it('never publishes a symlinked thumbnail, even one named .png (PoC: ~/.ssh key)', () => {
    writeFileSync(join(outside, 'id_ed25519'), 'FAKE-SECRET-OUTSIDE-PROTOTYPE');
    symlinkSync(join(outside, 'id_ed25519'), join(folder('evil'), 'thumbnail.png'));
    expect(resolveThumbnails(root, [entry('evil', 'public/thumbnail.png')]).size).toBe(0);
  });

  it('never publishes through a symlinked prototype folder or a ../ path', () => {
    const real = join(outside, 'elsewhere', 'public');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'thumbnail.png'), PNG);
    symlinkSync(join(outside, 'elsewhere'), join(root, 'prototypes', 'linked'));
    writeFileSync(join(outside, 'loose.png'), PNG);
    const result = resolveThumbnails(root, [
      entry('linked', 'public/thumbnail.png'),
      entry('good', '../../../loose.png'),
    ]);
    expect(result.size).toBe(0);
  });

  it('ignores entries from an untrusted registry with unsafe slugs, kinds or paths', () => {
    writeFileSync(join(folder('ok-two'), 'thumbnail.png'), PNG);
    const result = resolveThumbnails(root, [
      entry('../../escaped', 'public/thumbnail.png', { path: 'prototypes/ok-two' }),
      entry('ok-two', 'public/thumbnail.png', { kind: 'weird' }),
      entry('ok-two', 'public/thumbnail.png', { path: '../outside' }),
    ]);
    expect(result.size).toBe(0);
  });
});
