import { defineTheme } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  applyAppearance,
  BUILTIN_THEMES,
  clearAppearance,
  noFlashScript,
  themeComponentProfile,
} from '../src/index.ts';

const base = BUILTIN_THEMES[0];
if (!base) throw new Error('no built-in theme');
const variant = (patch: Parameters<typeof defineTheme>[0] extends infer T ? Partial<T> : never) =>
  defineTheme({ ...base, ...patch, id: 'variant', name: 'Variant' });

describe('themeComponentProfile → ui data-py-* attributes', () => {
  it('keeps a theme without style free of profile attributes (today’s look)', () => {
    expect(themeComponentProfile(base)).toEqual({});
    const root = document.createElement('div');
    const applied = applyAppearance(root, { theme: base, resolvedMode: 'light' });
    expect(applied.components).toEqual({});
    expect(root.dataset.pyFocusRingStyle).toBeUndefined();
    expect(root.dataset.pyCardStyle).toBeUndefined();
    expect(root.dataset.pyButtonStyle).toBeUndefined();
    expect(root.style.getPropertyValue('--py-focus-ring-width')).toBe('2px');
    expect(root.style.getPropertyValue('--py-focus-ring-offset')).toBe('2px');
  });

  it('maps focus ring, surface, elevation and radius to profiles and CSS variables', () => {
    const theme = variant({
      radius: '0',
      style: { surface: 'glass', focusRing: { style: 'inset', width: '3px', offset: '0' } },
    });
    expect(themeComponentProfile(theme)).toEqual({
      focusRing: 'inset',
      card: 'glass',
      button: 'square',
    });
    const root = document.createElement('div');
    applyAppearance(root, { theme, resolvedMode: 'dark' });
    expect(root.dataset.pyFocusRingStyle).toBe('inset');
    expect(root.dataset.pyCardStyle).toBe('glass');
    expect(root.dataset.pyButtonStyle).toBe('square');
    expect(root.style.getPropertyValue('--py-focus-ring-width')).toBe('3px');
    expect(root.style.getPropertyValue('--py-focus-ring-offset')).toBe('0');

    expect(
      themeComponentProfile(variant({ radius: '9999px', style: { elevation: 'flat' } }))
    ).toEqual({ card: 'bordered', button: 'pill' });
    expect(themeComponentProfile(variant({ radius: '62.5rem' })).button).toBe('pill');

    // Switching back to a plain theme removes the attributes; clear removes everything.
    applyAppearance(root, { theme: base, resolvedMode: 'light' });
    expect(root.dataset.pyCardStyle).toBeUndefined();
    applyAppearance(root, { theme, resolvedMode: 'light' });
    clearAppearance(root);
    expect(root.dataset.pyFocusRingStyle).toBeUndefined();
    expect(root.dataset.pyButtonStyle).toBeUndefined();
  });

  it('the no-flash script replays only allowlisted profile values', () => {
    const script = noFlashScript('demo');
    expect(script).toContain("p.card==='glass'||p.card==='bordered'");
    expect(script).toContain('(ring|outline|glow|inset)');
  });
});
