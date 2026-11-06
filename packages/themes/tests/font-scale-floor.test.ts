import { describe, expect, it } from 'vitest';
import { oceanTheme, themeVariables } from '../src/index.ts';

function withRatio(scaleRatio: number | null) {
  const theme = {
    ...oceanTheme,
    style: { ...oceanTheme.style, typography: { ...oceanTheme.style.typography, scaleRatio } },
  };
  return themeVariables({ theme, resolvedMode: 'light' });
}

describe('type scale floors (Dailybot G-061)', () => {
  it('keeps text-xs and text-sm readable on a steep ratio', () => {
    const vars = withRatio(1.25);
    expect(vars['--tx-font-size-xs']).toBe('max(0.64rem, 12px)');
    expect(vars['--tx-font-size-sm']).toBe('max(0.8rem, 13px)');
    expect(vars['--tx-font-size-base']).toBe('1rem');
    expect(vars['--tx-font-size-lg']).toBe('1.25rem');
  });

  it('leaves the default scale untouched', () => {
    const vars = withRatio(null);
    expect(vars['--tx-font-size-xs']).toBe('0.75rem');
    expect(vars['--tx-font-size-sm']).toBe('0.875rem');
  });
});
