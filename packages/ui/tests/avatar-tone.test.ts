import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from '../src/index.ts';

afterEach(cleanup);

describe('Avatar tone and shape (Texuli 0.14.3, UG-29)', () => {
  it('forwards tone and shape to Texuli', () => {
    const { container } = render(Avatar, {
      props: { name: 'Ada Example', tone: 'success', shape: 'square' },
    });
    const root = container.firstElementChild as HTMLElement;
    expect(root.outerHTML).toMatch(/success/);
    expect(root.outerHTML).toMatch(/square/);
  });
});
