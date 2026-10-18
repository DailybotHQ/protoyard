import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'packages/ui/src/styles/variants.css'), 'utf8');

describe('theme component profiles', () => {
  it('keeps component styles opt-in and exposes the button shapes', () => {
    expect(css).toContain('With no attribute every');
    for (const shape of ['pill', 'rounded', 'square']) {
      expect(css).toContain(`[data-py-button-style="${shape}"]`);
    }
    expect(css).toContain('border-radius: 9999px');
    expect(css).toContain('border-radius: var(--radius-md)');
    expect(css).toContain('border-radius: 0');
  });

  it('styles each card and input profile with theme tokens', () => {
    for (const style of ['flat', 'bordered', 'elevated', 'glass']) {
      expect(css).toContain(`[data-py-card-style="${style}"]`);
    }
    for (const style of ['filled', 'underline']) {
      expect(css).toContain(`[data-py-input-style="${style}"]`);
    }
    expect(css).toContain('var(--shadow-float)');
    expect(css).toContain('var(--color-muted)');
    expect(css).toContain('var(--color-input)');
  });

  it('provides navigation and accessible focus-ring profiles', () => {
    for (const style of ['pills', 'underline']) {
      expect(css).toContain(`[data-py-navigation-style="${style}"]`);
    }
    for (const style of ['ring', 'outline', 'glow', 'inset']) {
      expect(css).toContain(`[data-py-focus-ring-style="${style}"]`);
    }
    expect(css).toContain('var(--color-ring)');
  });
});
