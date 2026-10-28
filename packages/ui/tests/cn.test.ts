import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn.ts';

describe('cn (alias of Texuli cx)', () => {
  it('joins strings, arrays and conditional objects, dropping falsy values', () => {
    expect(cn('flex', 'items-center', false && 'hidden', 'gap-2')).toBe('flex items-center gap-2');
    expect(cn(['a', ['b', null]], { c: true, d: false }, undefined, '')).toBe('a b c');
  });

  it('no longer resolves Tailwind conflicts: both classes stay, in order', () => {
    expect(cn('p-4', 'p-2')).toBe('p-4 p-2');
    expect(cn('shadow-soft', 'shadow-none')).toBe('shadow-soft shadow-none');
  });
});
