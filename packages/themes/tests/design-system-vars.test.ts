import { describe, expect, it } from 'vitest';
import { compileDesignSystemDocument, designSystemVars } from '../src/index.ts';

const DOCUMENT = {
  format: 'texuli/design-system',
  formatVersion: 1,
  id: 'ledger',
  version: '1.0.0',
  name: 'Ledger',
  color: { brand: { seed: '#0f766e' } },
  extensions: { highlight: { light: '#fde68a', dark: '#78350f' } },
};

describe('designSystemVars (UG-48)', () => {
  it('returns every compiled variable of a mode, product extensions included', async () => {
    const result = await compileDesignSystemDocument(DOCUMENT);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const light = designSystemVars(result.shipped, 'light');
    const dark = designSystemVars(result.shipped, 'dark');
    expect(light['--tx-ext-highlight']).toBe('#fde68a');
    expect(dark['--tx-ext-highlight']).toBe('#78350f');
    expect(light['--tx-primary']).toBe(result.shipped.vars.light?.['--tx-primary']);
    // A copy: writing to it leaves the compiled design system alone.
    light['--tx-primary'] = '#000000';
    expect(result.shipped.vars.light?.['--tx-primary']).not.toBe('#000000');
  });

  it('a mode the design system did not compile reads the mode Texuli paints', () => {
    const lightOnly = { vars: { light: { '--tx-primary': '#0f766e' } } };
    expect(designSystemVars(lightOnly, 'dark')).toEqual({ '--tx-primary': '#0f766e' });
  });
});
