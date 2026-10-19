import { describe, expect, it } from 'vitest';
import { buildScenarioLink, parseScenarioLink } from '../src/index.ts';

describe('style preset link params', () => {
  it('round-trips ?radius ?elevation ?font ?motion through build and parse', () => {
    const link = buildScenarioLink('/demo/', {
      scenario: 'active-month',
      radius: 'pill',
      elevation: 'flat',
      font: 'editorial',
      motion: 'none',
    });
    expect(link).toBe(
      '/demo/?scenario=active-month&radius=pill&elevation=flat&font=editorial&motion=none'
    );
    expect(parseScenarioLink(new URL(link, 'http://x.example').search)).toEqual({
      scenario: 'active-month',
      radius: 'pill',
      elevation: 'flat',
      font: 'editorial',
      motion: 'none',
    });
  });

  it('ignores values outside the preset ids (never free CSS)', () => {
    expect(
      parseScenarioLink('?radius=3px&elevation=neon&font=Comic%20Sans&motion=cubic-bezier(0,0,1,1)')
    ).toEqual({});
    expect(parseScenarioLink('?radius=&motion=subtle&font=SANS')).toEqual({ motion: 'subtle' });
  });
});
