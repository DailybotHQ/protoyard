import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Avatar from '../src/components/avatar/Avatar.svelte';
import MessageList from '../src/components/chat/MessageList.svelte';
import UserPicker from '../src/components/user-picker/UserPicker.svelte';
import { isSafeImageSource, safeSrcset } from '../src/lib/image-source.ts';

afterEach(() => cleanup());

const SRC = './avatars/64/av-001.webp';
const SRCSET = './avatars/64/av-001.webp 1x, ./avatars/128/av-001.webp 2x';

describe('Avatar image', () => {
  it('renders a lazy, async, fixed-size image with srcset and the name as alt', () => {
    render(Avatar, { name: 'Grace Hopper', src: SRC, srcset: SRCSET, size: 'sm' });
    // One accessible element: the photo itself, named by its alt.
    const img = screen.getByRole('img', { name: 'Grace Hopper' });
    expect(img.tagName).toBe('IMG');
    expect(img.parentElement?.dataset.avatar).toBe('image');
    expect(img.parentElement?.getAttribute('title')).toBe('Grace Hopper');
    expect(img?.getAttribute('src')).toBe(SRC);
    expect(img?.getAttribute('srcset')).toBe(SRCSET);
    expect(img?.getAttribute('alt')).toBe('Grace Hopper');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.getAttribute('width')).toBe('28');
    expect(img?.getAttribute('height')).toBe('28');
  });

  it('names the photo with a caller aria-label', () => {
    render(Avatar, { name: 'Ada', src: SRC, 'aria-label': 'Assigned to Ada' });
    expect(screen.getByRole('img', { name: 'Assigned to Ada' }).tagName).toBe('IMG');
  });

  it('uses an empty alt and hides itself when decorative', () => {
    const { container } = render(Avatar, { name: 'Grace Hopper', src: SRC, decorative: true });
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('passes https URLs and root-relative paths through', () => {
    const { container } = render(Avatar, {
      name: 'Ada',
      src: 'https://images.example.com/ada.webp',
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://images.example.com/ada.webp'
    );
    cleanup();
    const second = render(Avatar, { name: 'Ada', src: '/avatars/64/av-002.webp' });
    expect(second.container.querySelector('img')?.getAttribute('src')).toBe(
      '/avatars/64/av-002.webp'
    );
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'http://images.example.com/a.webp',
    '//evil.example.com/a.webp',
    'https://images.example.com/a b.webp',
    '',
  ])('falls back to initials for an unsafe src (%s)', (src) => {
    const { container } = render(Avatar, { name: 'Grace Hopper', src });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Grace Hopper' }).textContent?.trim()).toBe('GH');
  });

  it('drops an unsafe srcset but keeps a safe src', () => {
    const { container } = render(Avatar, {
      name: 'Ada',
      src: SRC,
      srcset: `${SRC} 1x, javascript:alert(1) 2x`,
    });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SRC);
    expect(img?.hasAttribute('srcset')).toBe(false);
  });

  it('falls back to initials when the image fails, and retries a new src', async () => {
    const { container, rerender } = render(Avatar, { name: 'Grace Hopper', src: SRC });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    await fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.trim()).toBe('GH');
    expect(container.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('initials');
    await rerender({ name: 'Grace Hopper', src: './avatars/64/av-003.webp' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('./avatars/64/av-003.webp');
  });
});

describe('isSafeImageSource', () => {
  it('accepts https, root-relative and relative paths only', () => {
    expect(isSafeImageSource('https://a.example.com/x.webp')).toBe(true);
    expect(isSafeImageSource('/avatars/64/av-001.webp')).toBe(true);
    expect(isSafeImageSource('./avatars/64/av-001.webp')).toBe(true);
    expect(isSafeImageSource('avatars/64/av-001.webp')).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'blob:https://a.example.com/1',
      'http://a.example.com/x.webp',
      '//a.example.com/x.webp',
      '/x\\y.webp',
      'https://a.example.com/"x',
      null,
      undefined,
      42,
    ]) {
      expect(isSafeImageSource(bad)).toBe(false);
    }
  });

  it('checks every srcset candidate', () => {
    expect(safeSrcset(SRCSET)).toBe(SRCSET);
    expect(safeSrcset('/a.webp 64w, /b.webp 128w')).toBe('/a.webp 64w, /b.webp 128w');
    expect(safeSrcset('/a.webp 1x, data:image/png;base64,AAAA 2x')).toBeUndefined();
    expect(safeSrcset('/a.webp 1x onerror')).toBeUndefined();
    expect(safeSrcset(undefined)).toBeUndefined();
  });
});

describe('kit components pass faces through', () => {
  it('MessageList shows the author photo with its srcset, decorative', () => {
    const ada = { id: 'u1', name: 'Ada Lovelace', avatarUrl: SRC, avatarSrcset: SRCSET };
    const bob = { id: 'u2', name: 'Bob Stone' };
    const { container } = render(MessageList, {
      messages: [
        { id: 'm1', author: ada, body: 'Hi', at: '2026-01-01T10:00:00Z' },
        { id: 'm2', author: bob, body: 'Hello', at: '2026-01-01T10:01:00Z' },
      ],
      currentUserId: 'u3',
    });
    const faces = container.querySelectorAll('img');
    expect(faces).toHaveLength(1);
    expect(faces[0]?.getAttribute('srcset')).toBe(SRCSET);
    expect(faces[0]?.getAttribute('alt')).toBe('');
    expect(container.textContent).toContain('BS');
  });

  it('UserPicker options show each user photo, initials otherwise', () => {
    const { container } = render(UserPicker, {
      variant: 'inline',
      users: [
        { id: 'a', name: 'Ada Lovelace', avatarUrl: SRC, avatarSrcset: SRCSET },
        { id: 'b', name: 'Bob Stone' },
      ],
    });
    const ada = screen.getByRole('option', { name: /Ada Lovelace/ });
    expect(ada.querySelector('img')?.getAttribute('srcset')).toBe(SRCSET);
    const bob = screen.getByRole('option', { name: /Bob Stone/ });
    expect(bob.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });
});
