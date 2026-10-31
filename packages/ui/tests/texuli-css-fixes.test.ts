import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CSS @protoyard/ui adds around Texuli components, and proof that the 0.5
 * workarounds Texuli now ships itself are gone. The browser effects are proven
 * end to end (lattice-saas-demo avatars, project-management phone board);
 * these pin the rules, which jsdom cannot lay out.
 */
const styles = readFileSync(join(import.meta.dirname, '../src/styles.css'), 'utf8');

describe('Texuli CSS fixes', () => {
  // Texuli 0.6 hides a loading avatar image by style, never [hidden] (G79), so
  // Tailwind's `[hidden] { display: none !important }` no longer stops it loading.
  it('adds no avatar [hidden] override: Texuli never hides the loading image with [hidden]', () => {
    expect(styles).not.toContain('[data-tx-avatar-image]');
    const image = readFileSync(
      join(
        import.meta.dirname,
        '../node_modules/@texuli/primitives/dist/avatar/AvatarImage.svelte'
      ),
      'utf8'
    );
    expect(image).not.toMatch(/\shidden=/);
    expect(image).toMatch(/opacity:0/);
  });

  // Texuli 0.6 positions the Board scroller itself (G76).
  it("adds no Board scroller rule: Texuli's scroller contains its screen-reader labels", () => {
    expect(styles).not.toContain('.tx-board__scroller');
    const board = readFileSync(
      join(import.meta.dirname, '../node_modules/@texuli/data/dist/board/Board.svelte'),
      'utf8'
    );
    const start = board.indexOf('.tx-board__scroller {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(board.slice(start, board.indexOf('}', start))).toMatch(/position:\s*relative/);
  });

  it('sizes the mobile app frame from the device screen height', () => {
    const start = styles.indexOf('.tx-mobile-frame,');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(styles.slice(start, styles.indexOf('}', start))).toMatch(
      /--tx-app-height:\s*var\(--py-app-height, 100dvh\)/
    );
  });
});
