import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import LayoutChrome from '../src/layouts/LayoutChrome.svelte';
import type { NavModel } from '../src/layouts/nav-model.ts';

afterEach(() => cleanup());

const nav = (
  image?: NavModel['user'] extends infer U ? (U extends { image?: infer I } ? I : never) : never
): NavModel => ({
  sections: [],
  user: { name: 'Marta Ruiz', detail: 'Owner', ...(image ? { image } : {}) },
});

describe('layout chrome user', () => {
  it("shows the persona's photo when the host passes one", () => {
    const { container } = render(LayoutChrome, {
      part: 'user',
      nav: nav({
        src: '/avatars/av-012-64.webp',
        srcset: '/avatars/av-012-64.webp 1x, /avatars/av-012-128.webp 2x',
      }),
    });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/avatars/av-012-64.webp');
    expect(img?.getAttribute('srcset')).toContain('2x');
    expect(container.textContent).toContain('Marta Ruiz');
  });

  it('falls back to initials without a photo', () => {
    const { container } = render(LayoutChrome, { part: 'user', nav: nav() });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('MR');
  });
});
