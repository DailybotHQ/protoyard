import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CSS @protoyard/ui adds around Texuli 0.5.0 components. The browser effects
 * are proven end to end (lattice-saas-demo avatars, project-management phone
 * board); these pin the rules, which jsdom cannot lay out.
 */
const styles = readFileSync(join(import.meta.dirname, '../src/styles.css'), 'utf8');

/** The declaration block of the first rule whose selector is `selector`. */
function rule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return styles.slice(start, styles.indexOf('}', start));
}

describe('Texuli CSS fixes', () => {
  it('renders a loading avatar image (Tailwind hides [hidden] with !important), invisibly', () => {
    const block = rule('  .tx-avatar [data-tx-avatar-image][hidden]');
    expect(block).toMatch(/display:\s*block\s*!important/);
    expect(block).toMatch(/opacity:\s*0/);
    expect(block).toMatch(/pointer-events:\s*none/);
    // Same layer as Tailwind's preflight, where the more specific selector wins.
    const layer = styles.lastIndexOf(
      '@layer base {',
      styles.indexOf('[data-tx-avatar-image][hidden]')
    );
    expect(layer).toBeGreaterThanOrEqual(0);
  });

  it("contains the Board's absolutely positioned labels in its scroller", () => {
    expect(rule('.tx-board__scroller')).toMatch(/position:\s*relative/);
  });

  it('sizes the mobile app frame from the device screen height', () => {
    const start = styles.indexOf('.tx-mobile-frame,');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(styles.slice(start, styles.indexOf('}', start))).toMatch(
      /--tx-app-height:\s*var\(--py-app-height, 100dvh\)/
    );
  });
});
