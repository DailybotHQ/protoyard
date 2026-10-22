import { afterEach, describe, expect, it, vi } from 'vitest';
import { lintDeckAssets } from '../src/authoring/deck-lint.ts';

const deck = (slides: unknown[]) => ({ slides });

afterEach(() => vi.restoreAllMocks());

describe('lintDeckAssets', () => {
  it('accepts HTTPS and safe local image and video references without fetching', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const result = lintDeckAssets(
      deck([
        {
          id: 'media',
          layout: 'free',
          blocks: [
            {
              type: 'image',
              src: 'https://cdn.example.test/cover.webp',
              width: 640,
              height: 360,
              credit: 'Example Studio',
            },
            { type: 'image', src: './assets/diagram.png', width: 640, height: 360 },
            { type: 'video', src: '/media/intro.mp4', poster: './assets/poster.webp' },
          ],
        },
      ])
    );

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not require dimensions for catalog image props where the schema makes them optional', () => {
    const result = lintDeckAssets(
      deck([
        {
          id: 'image-layout',
          layout: 'image-centered',
          props: { image: { src: './assets/cover.webp', alt: 'A sample cover' } },
        },
      ])
    );

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects javascript and hostile data media with exact source paths', () => {
    const result = lintDeckAssets(
      deck([
        {
          id: 'unsafe',
          layout: 'free',
          blocks: [
            { type: 'image', src: 'javascript:alert(1)', width: 10, height: 10 },
            { type: 'video', src: 'data:text/html;base64,PHNjcmlwdD4=' },
          ],
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-asset-url',
        severity: 'error',
        jsonPath: '$["slides"][0]["blocks"][0]["src"]',
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        jsonPath: '$["slides"][0]["blocks"][1]["src"]',
      })
    );
  });

  it('accepts bounded data media, as the deck schema and the player do (DECKS.md, Limits)', () => {
    const result = lintDeckAssets(
      deck([
        {
          id: 'embedded',
          layout: 'free',
          blocks: [
            {
              type: 'image',
              src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX2Gk9wAAAABJRU5ErkJggg==',
              alt: 'A pixel',
              width: 10,
              height: 10,
            },
            { type: 'video', src: 'data:video/mp4;base64,AAAA', poster: 'avatar:av-007' },
          ],
        },
      ])
    );
    expect(result.diagnostics).toEqual([]);
    // An SVG data URI is never raster media.
    const svg = lintDeckAssets(
      deck([
        {
          id: 'svg',
          layout: 'free',
          blocks: [
            { type: 'image', src: 'data:image/svg+xml;base64,PHN2Zz4=', width: 10, height: 10 },
          ],
        },
      ])
    );
    expect(svg.valid).toBe(false);
  });

  it('rejects malformed, insecure, protocol-relative and traversing references', () => {
    const result = lintDeckAssets(
      deck([
        {
          id: 'invalid',
          layout: 'free',
          blocks: [
            { type: 'image', src: 'https://', width: 10, height: 10 },
            { type: 'image', src: 'http://example.test/image.png', width: 10, height: 10 },
            { type: 'image', src: '//example.test/image.png', width: 10, height: 10 },
            { type: 'image', src: '../outside.png', width: 10, height: 10 },
          ],
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.every((item) => item.severity === 'error')).toBe(true);
  });

  it('requires image dimensions and advises attribution for remote images', () => {
    const result = lintDeckAssets(
      deck([
        {
          id: 'missing-details',
          layout: 'free',
          blocks: [{ type: 'image', src: 'https://cdn.example.test/photo.jpg' }],
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'image-dimensions', severity: 'error' })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'image-credit',
        severity: 'warning',
        jsonPath: '$["slides"][0]["blocks"][0]["src"]',
      })
    );
  });

  it('checks media nested inside embedded-app data and preserves the full path', () => {
    const result = lintDeckAssets(
      deck([
        {
          id: 'embed',
          layout: 'free',
          blocks: [
            {
              type: 'embed-app',
              app: {
                screens: [
                  { blocks: [{ type: 'image', src: 'javascript:void(0)', width: 10, height: 10 }] },
                ],
              },
            },
          ],
        },
      ])
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-asset-url',
        jsonPath: '$["slides"][0]["blocks"][0]["app"]["screens"][0]["blocks"][0]["src"]',
      })
    );
  });
});
