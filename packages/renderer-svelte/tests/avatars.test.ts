import { describe, expect, it } from 'vitest';
import {
  AVATAR_COUNT,
  AVATAR_IDS,
  AVATAR_SIZES,
  isAvatarId as libraryIsAvatarId,
} from '../../avatars/src/index.ts';
import { AVATAR_IMAGE_SIZES } from '../src/avatars-plugin.ts';
import { AVATAR_BASE, avatarSrcset, avatarUrl, isAvatarId, isAvatarUrl } from '../src/index.ts';
import { resolveAvatarSettings } from '../src/vite.ts';

describe('avatarUrl', () => {
  it('builds a base-relative URL for an avatar id (relocatable by default)', () => {
    // No Vite define under Vitest: the relocatable default.
    expect(AVATAR_BASE).toBe('./avatars/');
    expect(avatarUrl('av-007')).toBe('./avatars/128/av-007.webp');
    expect(avatarUrl('av-007', 64)).toBe('./avatars/64/av-007.webp');
    expect(avatarUrl('av-175', 128)).toBe('./avatars/128/av-175.webp');
  });

  it('honors a build base and a shared showcase base', () => {
    expect(avatarUrl('av-001', 64, { base: '/protos/crm/avatars/' })).toBe(
      '/protos/crm/avatars/64/av-001.webp'
    );
    // The showcase points every app at one folder at the site root.
    expect(avatarUrl('av-001', 128, { base: '/avatars' })).toBe('/avatars/128/av-001.webp');
    expect(avatarUrl('av-001', 128, { base: '/protoyard/avatars/' })).toBe(
      '/protoyard/avatars/128/av-001.webp'
    );
  });

  it('falls back to the shipped size and to undefined when avatars are off', () => {
    // Artifact packs ship 128 px only.
    expect(avatarUrl('av-002', 64, { sizes: [128] })).toBe('./avatars/128/av-002.webp');
    expect(avatarUrl('av-002', 128, { sizes: [64] })).toBe('./avatars/64/av-002.webp');
    expect(avatarUrl('av-002', 64, { sizes: [] })).toBeUndefined();
  });

  it('returns undefined for anything that is not an avatar id or a safe URL', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'av-000',
      'av-176',
      'av-1',
      'av-0001',
      'AV-001',
      ' av-001',
      'avatar-001',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'http://example.com/a.png',
      '//example.com/a.png',
      'images/a.png',
      '../a.png',
      'https://example.com/a b.png',
      '/a"onerror="x.png',
      '/a\\b.png',
    ]) {
      expect(avatarUrl(bad as string), String(bad)).toBeUndefined();
    }
  });

  it('passes https and root-relative URL avatars through unchanged', () => {
    expect(avatarUrl('https://images.example.com/p/1.webp', 64)).toBe(
      'https://images.example.com/p/1.webp'
    );
    expect(avatarUrl('/uploads/me.png')).toBe('/uploads/me.png');
    expect(isAvatarUrl('https://')).toBe(false);
    expect(isAvatarUrl(`https://example.com/${'a'.repeat(2050)}`)).toBe(false);
  });
});

describe('avatarSrcset', () => {
  it('gives 64 px at 1x and 128 px at 2x', () => {
    expect(avatarSrcset('av-010')).toBe(
      './avatars/64/av-010.webp 1x, ./avatars/128/av-010.webp 2x'
    );
    expect(avatarSrcset('av-010', { base: '/avatars/' })).toBe(
      '/avatars/64/av-010.webp 1x, /avatars/128/av-010.webp 2x'
    );
  });

  it('is undefined for URL avatars, invalid ids and single-size builds', () => {
    expect(avatarSrcset('https://images.example.com/p/1.webp')).toBeUndefined();
    expect(avatarSrcset('av-999')).toBeUndefined();
    expect(avatarSrcset(undefined)).toBeUndefined();
    expect(avatarSrcset('av-010', { sizes: [128] })).toBeUndefined();
  });
});

describe('avatar id rules', () => {
  it('match @protoyard/avatars exactly (the renderer mirrors them without a dependency)', () => {
    expect([...AVATAR_IMAGE_SIZES]).toEqual([...AVATAR_SIZES]);
    for (const id of AVATAR_IDS) expect(isAvatarId(id)).toBe(true);
    expect(AVATAR_IDS).toHaveLength(AVATAR_COUNT);
    for (const probe of ['av-000', 'av-176', 'av-1000', 'av-01', 'x', 7, null]) {
      expect(isAvatarId(probe)).toBe(libraryIsAvatarId(probe));
    }
  });
});

describe('resolveAvatarSettings', () => {
  it('emits both sizes under <base>avatars/ by default', () => {
    expect(resolveAvatarSettings('./', {})).toEqual({
      base: './avatars/',
      sizes: [64, 128],
      emit: true,
    });
    expect(resolveAvatarSettings('/protos/crm/', {}).base).toBe('/protos/crm/avatars/');
    expect(resolveAvatarSettings('/protos/crm', {}).base).toBe('/protos/crm/avatars/');
  });

  it('points at a shared base and then emits nothing', () => {
    expect(
      resolveAvatarSettings('/p/crm-demo/app/', { PROTOYARD_AVATAR_BASE: '/avatars' })
    ).toEqual({ base: '/avatars/', sizes: [64, 128], emit: false });
  });

  it('narrows sizes, opts out, and rejects bad values', () => {
    expect(resolveAvatarSettings('./', { PROTOYARD_AVATAR_SIZES: '128' }).sizes).toEqual([128]);
    expect(resolveAvatarSettings('./', { PROTOYARD_AVATAR_SIZES: '128, 64,128' }).sizes).toEqual([
      64, 128,
    ]);
    expect(resolveAvatarSettings('./', {}, { avatars: false })).toMatchObject({
      sizes: [],
      emit: false,
    });
    expect(resolveAvatarSettings('./', { PROTOYARD_AVATARS: '0' })).toMatchObject({
      sizes: [],
      emit: false,
    });
    // The env wins over the config option, like every other PROTOYARD_* setting.
    expect(
      resolveAvatarSettings('./', { PROTOYARD_AVATARS: '1' }, { avatars: false }).sizes
    ).toEqual([64, 128]);
    expect(() => resolveAvatarSettings('./', { PROTOYARD_AVATAR_SIZES: '256' })).toThrow(
      /PROTOYARD_AVATAR_SIZES/
    );
    for (const bad of [
      'javascript:alert(1)',
      '//cdn.example.com/',
      'avatars/',
      '/a"b/',
      'http://x/',
    ]) {
      expect(() => resolveAvatarSettings('./', { PROTOYARD_AVATAR_BASE: bad }), bad).toThrow(
        /PROTOYARD_AVATAR_BASE/
      );
    }
  });
});
