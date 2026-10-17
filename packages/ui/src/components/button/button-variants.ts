import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
import { tv, type VariantProps } from 'tailwind-variants';
import type { WithElementRef } from '../../lib/types.ts';

export const buttonVariants = tv({
  base: [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'transition-[color,background-color,border-color,box-shadow,opacity] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-input bg-surface text-foreground shadow-soft hover:bg-muted',
      ghost: 'text-foreground hover:bg-muted',
      destructive: 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
      link: 'text-primary underline-offset-4 hover:underline',
    },
    size: {
      // Small/medium controls grow to a 44px touch target below the `sm` breakpoint.
      sm: 'h-8 min-h-touch px-3 text-xs sm:min-h-0',
      md: 'h-9 min-h-touch px-4 sm:min-h-0',
      lg: 'h-11 px-6 text-base',
      icon: 'size-9 min-h-touch min-w-[44px] sm:min-h-0 sm:min-w-0',
    },
  },
  compoundVariants: [{ variant: 'link', class: 'h-auto px-0 shadow-none' }],
  defaultVariants: { variant: 'default', size: 'md' },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
  WithElementRef<HTMLAnchorAttributes> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Shows a spinner, sets `aria-busy` and blocks interaction. */
    loading?: boolean;
    /** Accessible text announced while loading (defaults to the visible label). */
    loadingLabel?: string;
  };
