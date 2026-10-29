import { Avatar } from '@protoyard/ui';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { avatarImage } from '../src/index.ts';

afterEach(() => cleanup());

/** Renders the real `@protoyard/ui` Avatar the way every kit does. */
function face(avatar: unknown) {
  const { container } = render(Avatar, { name: 'Grace Hopper', ...avatarImage(avatar) });
  return container.querySelector('img');
}

describe('avatarImage', () => {
  it('resolves a library id to the 64 px image with a 1x/2x srcset', () => {
    expect(avatarImage('av-001')).toEqual({
      src: './avatars/64/av-001.webp',
      srcset: './avatars/64/av-001.webp 1x, ./avatars/128/av-001.webp 2x',
    });
    expect(avatarImage('av-175', { base: '/avatars/' }).src).toBe('/avatars/64/av-175.webp');
    // An artifact pack ships 128 px only: one image, no srcset.
    expect(avatarImage('av-001', { sizes: [128] })).toEqual({ src: './avatars/128/av-001.webp' });
  });

  it('passes https URLs and root-relative paths through, without a srcset', () => {
    expect(avatarImage('https://images.example.com/p/1.webp')).toEqual({
      src: 'https://images.example.com/p/1.webp',
    });
    expect(avatarImage('/faces/1.webp')).toEqual({ src: '/faces/1.webp' });
  });

  it('gives nothing for missing, unsafe or unknown values (snapshots are untrusted)', () => {
    for (const value of [
      undefined,
      null,
      '',
      42,
      { src: 'https://images.example.com/x.webp' },
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'http://images.example.com/x.webp',
      '//evil.example.com/x.webp',
      'https://user:pass@images.example.com/x.webp',
      './relative.webp',
      'av-999',
      'av-000',
      'av-1',
    ]) {
      expect(avatarImage(value)).toEqual({});
    }
    // A build with avatars turned off ships no sizes: ids show initials.
    expect(avatarImage('av-001', { sizes: [] })).toEqual({});
  });
});

describe('Avatar with a persona avatar', () => {
  it('renders the face: src, srcset, lazy and fixed size', () => {
    const img = face('av-042');
    expect(img?.getAttribute('src')).toBe('./avatars/64/av-042.webp');
    expect(img?.getAttribute('srcset')).toBe(
      './avatars/64/av-042.webp 1x, ./avatars/128/av-042.webp 2x'
    );
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.getAttribute('width')).toBe('36');
    // Texuli's Avatar names its root (role=img); the image itself is decorative.
    expect(img?.closest('[role="img"]')?.getAttribute('aria-label')).toBe('Grace Hopper');
  });

  it('shows an https avatar as is', () => {
    expect(face('https://images.example.com/p/1.webp')?.getAttribute('src')).toBe(
      'https://images.example.com/p/1.webp'
    );
  });

  it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA', 'av-999', undefined])(
    'falls back to initials for %s',
    (value) => {
      const { container } = render(Avatar, { name: 'Grace Hopper', ...avatarImage(value) });
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent?.trim()).toBe('GH');
    }
  );

  it('falls back to initials when the face fails to load', async () => {
    const { container } = render(Avatar, { name: 'Grace Hopper', ...avatarImage('av-007') });
    await fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.trim()).toBe('GH');
  });
});
