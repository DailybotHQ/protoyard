import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Avatar from '../src/components/avatar/Avatar.svelte';
import { parseAddress } from '../src/components/browser-chrome/address.ts';
import { DEFAULT_DRAWER_SIZE, resolveDrawerSize } from '../src/components/overlay/drawer.ts';

/**
 * Untrusted-input guards of `@protoyard/ui`: values that can come from a
 * snapshot or a caller (sizes, typed addresses, avatar URLs) never reach the
 * DOM as CSS, a script URL or an unsafe image source.
 */

afterEach(() => cleanup());

const SRC = './avatars/64/av-001.webp';

describe('@protoyard/ui untrusted input', () => {
  it('Drawer sizes accept plain lengths and pixels, and reject anything that could inject CSS', () => {
    expect(resolveDrawerSize('right', '30rem')).toBe('30rem');
    expect(resolveDrawerSize('bottom', '40%')).toBe('40%');
    expect(resolveDrawerSize('left', 320.4)).toBe('320px');
    expect(resolveDrawerSize('right', '10px;background:red')).toBe(DEFAULT_DRAWER_SIZE.right);
    expect(resolveDrawerSize('top', 'var(--x)')).toBe(DEFAULT_DRAWER_SIZE.top);
    expect(resolveDrawerSize('right', -5)).toBe(DEFAULT_DRAWER_SIZE.right);
  });

  it('BrowserChrome neutralizes javascript schemes and foreign hosts into an in-app route', () => {
    const route = parseAddress('javascript:alert(1)');
    expect(route).toBe('#/alert(1)');
    expect(route).not.toContain('javascript:');
    expect(parseAddress('https://outside.example.test/reports?range=week')).toBe(
      '#/reports?range=week'
    );
  });

  it('Avatar falls back to initials for an unsafe src', () => {
    for (const src of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'http://images.example.com/a.webp',
      '//evil.example.com/a.webp',
      '',
    ]) {
      const { container } = render(Avatar, { name: 'Grace Hopper', src });
      expect(container.querySelector('img'), src).toBeNull();
      expect(screen.getByRole('img', { name: 'Grace Hopper' }).textContent?.trim()).toBe('GH');
      cleanup();
    }
  });

  it('Avatar drops unsafe srcset candidates but keeps the safe ones and the src', () => {
    const { container } = render(Avatar, {
      name: 'Ada',
      src: SRC,
      srcset: `${SRC} 1x, javascript:alert(1) 2x`,
    });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SRC);
    expect(img?.getAttribute('srcset') ?? '').not.toContain('javascript');
  });
});
