import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { MessageList } from '@texuli/chat';
import { afterEach, describe, expect, it } from 'vitest';
import Avatar from '../src/components/avatar/Avatar.svelte';
import UserPicker from '../src/components/user-picker/UserPicker.svelte';

afterEach(() => cleanup());

const SRC = './avatars/64/av-001.webp';
const SRCSET = './avatars/64/av-001.webp 1x, ./avatars/128/av-001.webp 2x';

describe('Avatar image', () => {
  it('renders a lazy, async, fixed-size image with srcset and the name as alt', () => {
    const { container } = render(Avatar, {
      name: 'Grace Hopper',
      src: SRC,
      srcset: SRCSET,
      size: 'sm',
    });
    // One accessible element: Texuli's avatar root (role="img"), named by the name.
    const root = screen.getByRole('img', { name: 'Grace Hopper' });
    expect(root.hasAttribute('data-tx-avatar')).toBe(true);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(root.dataset.avatar).toBe('image');
    expect(root.getAttribute('title')).toBe('Grace Hopper');
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SRC);
    expect(img?.getAttribute('srcset')).toBe(SRCSET);
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.getAttribute('width')).toBe('28');
    expect(img?.getAttribute('height')).toBe('28');
  });

  it('names the photo with a caller aria-label', () => {
    render(Avatar, { name: 'Ada', src: SRC, 'aria-label': 'Assigned to Ada' });
    expect(screen.getByRole('img', { name: 'Assigned to Ada' })).toBeTruthy();
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

  it('drops unsafe srcset candidates but keeps the safe ones and the src', () => {
    const { container } = render(Avatar, {
      name: 'Ada',
      src: SRC,
      srcset: `${SRC} 1x, javascript:alert(1) 2x`,
    });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SRC);
    expect(img?.getAttribute('srcset') ?? '').not.toContain('javascript');
  });

  it('falls back to initials when the image fails, and retries a new src', async () => {
    const { container, rerender } = render(Avatar, { name: 'Grace Hopper', src: SRC });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    await fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.trim()).toBe('GH');
    await rerender({ name: 'Grace Hopper', src: './avatars/64/av-003.webp' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('./avatars/64/av-003.webp');
  });
});

describe('kit components pass faces through', () => {
  // Texuli's MessageList renders `avatarUrl` only; the 2x `srcset` returns
  // when @texuli/chat passes the author's to its avatar (gap N19).
  it.todo('MessageList passes the author photo srcset (Texuli gap N19)');

  it('MessageList shows the author photo, decorative, and initials otherwise', () => {
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
    expect(faces[0]?.getAttribute('src')).toBe(SRC);
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
