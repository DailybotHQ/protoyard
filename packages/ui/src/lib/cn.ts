import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Protoyard custom utilities that plain `twMerge` does not know about
 * (`@utility` and `@theme` tokens in `@protoyard/themes/base.css`). Without
 * these class groups, a consumer override like `shadow-none` cannot replace a
 * component default `shadow-soft`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      /**
       * Theme shadows from `@theme` (`--shadow-soft`, `--shadow-float`).
       * Compete with Tailwind's built-in `shadow-*` scale and `shadow-none`.
       */
      shadow: [{ shadow: ['soft', 'float'] }],
      /**
       * Touch target and app-viewport heights (`min-h-touch`, `min-h-app`, …).
       */
      'min-h': [{ 'min-h': ['touch', 'app'] }],
      'max-h': [{ 'max-h': ['app'] }],
      h: [{ h: ['app'] }],
      /**
       * Safe-area padding helpers (`pt-safe`, `px-safe`, …).
       */
      pt: [{ pt: ['safe'] }],
      pb: [{ pb: ['safe'] }],
      pl: [{ pl: ['safe'] }],
      pr: [{ pr: ['safe'] }],
      px: [{ px: ['safe'] }],
      /**
       * Surface / semantic color tokens from `@theme inline` so later
       * backgrounds and text colors win over earlier ones.
       */
      'bg-color': [
        {
          bg: [
            'background',
            'surface',
            'elevated',
            'muted',
            'primary',
            'secondary',
            'accent',
            'destructive',
            'success',
            'warning',
            'info',
            'sidebar',
            'input',
            'card',
            'primary-hover',
            'destructive-hover',
          ],
        },
      ],
      'text-color': [
        {
          text: [
            'background',
            'foreground',
            'surface',
            'surface-foreground',
            'elevated',
            'muted',
            'muted-foreground',
            'primary',
            'primary-foreground',
            'secondary',
            'secondary-foreground',
            'accent',
            'accent-foreground',
            'destructive',
            'destructive-foreground',
            'success',
            'success-foreground',
            'warning',
            'warning-foreground',
            'info',
            'info-foreground',
            'sidebar',
            'sidebar-foreground',
          ],
        },
      ],
      /**
       * Theme font-size scale (`--text-xs` … `--text-9xl` in base.css).
       * Keeps later size utilities authoritative when mixed with defaults.
       */
      'font-size': [
        {
          text: [
            'xs',
            'sm',
            'base',
            'lg',
            'xl',
            '2xl',
            '3xl',
            '4xl',
            '5xl',
            '6xl',
            '7xl',
            '8xl',
            '9xl',
          ],
        },
      ],
    },
  },
});

/**
 * Compose class names. Later Tailwind and Protoyard utilities win over earlier
 * conflicting ones (including `shadow-soft`/`shadow-float`, `min-h-touch`,
 * surface colors and theme text sizes).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
