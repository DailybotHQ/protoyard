import { describe, expect, it } from 'vitest';
import { DeckBackgroundSchema } from '../src/backgrounds/schema.ts';
import { DeckSchema } from '../src/schema/index.ts';

const localImage = { kind: 'image', src: 'assets/cover.webp', alt: 'The launch team' } as const;
const localVideo = {
  kind: 'video',
  src: 'media/launch.mp4',
  poster: 'assets/launch-poster.webp',
} as const;

describe('slide media backgrounds', () => {
  it('accepts checked image and video specs on catalog and free slides', () => {
    const result = DeckSchema.safeParse({
      style: {},
      slides: [
        { id: 'image', layout: 'title-hero', background: localImage, props: { title: 'Launch' } },
        { id: 'video', layout: 'free', background: localVideo, blocks: [] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    { kind: 'image', src: 'https://media.example/cover.webp' },
    { kind: 'video', src: '//media.example/launch.mp4', poster: 'assets/poster.webp' },
    { kind: 'image', src: '../outside.webp' },
  ])('refuses untrusted media source $src', (background) => {
    expect(DeckBackgroundSchema.safeParse(background).success).toBe(false);
    expect(
      DeckSchema.safeParse({
        style: {},
        slides: [{ id: 'slide', layout: 'title-hero', background, props: { title: 'Launch' } }],
      }).success
    ).toBe(false);
  });
});
