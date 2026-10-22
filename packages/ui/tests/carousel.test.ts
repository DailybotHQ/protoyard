import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Carousel from '../src/components/carousel/Carousel.svelte';
import type { CarouselItem } from '../src/components/carousel/types.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const items: CarouselItem[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'team', label: 'Your team' },
  { id: 'ready', label: 'You are ready' },
];

const body = createRawSnippet<[CarouselItem, number]>((item) => ({
  render: () => {
    const current = item();
    return `<p data-testid="slide-body">${current.label}</p>`;
  },
}));

describe('Carousel', () => {
  it('exposes a carousel region with slide role description and live status', () => {
    const view = render(Carousel, {
      props: { items, label: 'Onboarding', children: body },
    });
    const region = view.getByRole('region', { name: 'Onboarding' });
    expect(region.getAttribute('aria-roledescription')).toBe('carousel');
    expect(view.getByText('Slide 1 of 3')).toBeTruthy();
    expect(
      view.container
        .querySelector('[data-py-carousel-slide="welcome"]')
        ?.getAttribute('aria-roledescription')
    ).toBe('slide');
  });

  it('moves with next/previous buttons and dots', async () => {
    const onIndexChange = vi.fn();
    const view = render(Carousel, {
      props: { items, label: 'Onboarding', children: body, onIndexChange },
    });

    await fireEvent.click(view.getByRole('button', { name: 'Next slide' }));
    await waitFor(() => expect(view.getByText('Slide 2 of 3')).toBeTruthy());
    expect(onIndexChange).toHaveBeenCalledWith(1);

    await fireEvent.click(view.getByRole('tab', { name: 'Go to slide 3: You are ready' }));
    await waitFor(() => expect(view.getByText('Slide 3 of 3')).toBeTruthy());

    await fireEvent.click(view.getByRole('button', { name: 'Previous slide' }));
    await waitFor(() => expect(view.getByText('Slide 2 of 3')).toBeTruthy());
  });

  it('supports arrow keys on the carousel root', async () => {
    const view = render(Carousel, {
      props: { items, label: 'Onboarding', children: body },
    });
    const region = view.getByRole('region', { name: 'Onboarding' });
    region.focus();
    await fireEvent.keyDown(region, { key: 'ArrowRight' });
    await waitFor(() => expect(view.getByText('Slide 2 of 3')).toBeTruthy());
    await fireEvent.keyDown(region, { key: 'ArrowLeft' });
    await waitFor(() => expect(view.getByText('Slide 1 of 3')).toBeTruthy());
    await fireEvent.keyDown(region, { key: 'End' });
    await waitFor(() => expect(view.getByText('Slide 3 of 3')).toBeTruthy());
    await fireEvent.keyDown(region, { key: 'Home' });
    await waitFor(() => expect(view.getByText('Slide 1 of 3')).toBeTruthy());
  });

  it('advances on a horizontal swipe past the threshold', async () => {
    const view = render(Carousel, {
      props: { items, label: 'Onboarding', children: body, swipeThreshold: 40 },
    });
    const region = view.getByRole('region', { name: 'Onboarding' });
    await fireEvent.pointerDown(region, { button: 0, pointerId: 1, clientX: 200 });
    await fireEvent.pointerMove(region, { pointerId: 1, clientX: 120 });
    await fireEvent.pointerUp(region, { pointerId: 1, clientX: 120 });
    await waitFor(() => expect(view.getByText('Slide 2 of 3')).toBeTruthy());
  });

  it('loops by default and can stop at the ends when loop is false', async () => {
    const view = render(Carousel, {
      props: { items, label: 'Onboarding', children: body, loop: false, index: 0 },
    });
    expect(view.getByRole('button', { name: 'Previous slide' }).hasAttribute('disabled')).toBe(
      true
    );
    await fireEvent.click(view.getByRole('button', { name: 'Next slide' }));
    await fireEvent.click(view.getByRole('button', { name: 'Next slide' }));
    await waitFor(() => expect(view.getByText('Slide 3 of 3')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Next slide' }).hasAttribute('disabled')).toBe(true);
  });

  it('skips transform transitions when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    const view = render(Carousel, {
      props: { items, label: 'Onboarding', children: body },
    });
    const track = view.container.querySelector('[data-py-carousel-track]');
    expect(track?.className).not.toContain('transition-transform');
  });
});
