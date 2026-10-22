import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn.ts';

describe('cn (Protoyard tailwind-merge)', () => {
  it('lets a later shadow utility replace shadow-soft and shadow-float', () => {
    expect(cn('shadow-soft', 'shadow-none')).toBe('shadow-none');
    expect(cn('shadow-soft', 'shadow-float')).toBe('shadow-float');
    expect(cn('shadow-float', 'shadow-soft')).toBe('shadow-soft');
    expect(cn('shadow-md', 'shadow-soft')).toBe('shadow-soft');
    expect(cn('shadow-soft', 'shadow-md')).toBe('shadow-md');
  });

  it('merges touch and app height utilities with the min-h / h scale', () => {
    expect(cn('min-h-touch', 'min-h-0')).toBe('min-h-0');
    expect(cn('min-h-0', 'min-h-touch')).toBe('min-h-touch');
    expect(cn('min-h-touch', 'min-h-app')).toBe('min-h-app');
    expect(cn('min-h-app', 'min-h-screen')).toBe('min-h-screen');
    expect(cn('h-app', 'h-full')).toBe('h-full');
    expect(cn('max-h-app', 'max-h-screen')).toBe('max-h-screen');
  });

  it('merges surface background and theme text color utilities', () => {
    expect(cn('bg-surface', 'bg-elevated')).toBe('bg-elevated');
    expect(cn('bg-elevated', 'bg-muted')).toBe('bg-muted');
    expect(cn('bg-primary', 'bg-destructive')).toBe('bg-destructive');
    expect(cn('text-muted-foreground', 'text-foreground')).toBe('text-foreground');
    expect(cn('text-primary', 'text-destructive')).toBe('text-destructive');
  });

  it('merges theme text-size utilities so the later size wins', () => {
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    expect(cn('text-base', 'text-xs')).toBe('text-xs');
    expect(cn('text-2xl', 'text-sm')).toBe('text-sm');
  });

  it('merges safe-area padding helpers with ordinary padding', () => {
    expect(cn('pt-safe', 'pt-4')).toBe('pt-4');
    expect(cn('px-safe', 'px-6')).toBe('px-6');
    expect(cn('pb-4', 'pb-safe')).toBe('pb-safe');
  });

  it('still composes non-conflicting classes and falsy inputs', () => {
    expect(cn('flex', 'items-center', false && 'hidden', 'gap-2')).toBe('flex items-center gap-2');
    expect(cn('shadow-soft', 'rounded-md', 'shadow-none')).toBe('rounded-md shadow-none');
  });

  it('matches the Button-style override that failed before the extend', () => {
    // Component default (outline button) + consumer class that clears the soft shadow.
    const classes = cn(
      'border border-input bg-surface text-foreground shadow-soft hover:bg-muted',
      'shadow-none'
    );
    expect(classes.split(/\s+/)).toContain('shadow-none');
    expect(classes.split(/\s+/)).not.toContain('shadow-soft');
  });
});
