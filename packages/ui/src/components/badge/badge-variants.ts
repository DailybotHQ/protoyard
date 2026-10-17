import { tv, type VariantProps } from 'tailwind-variants';

// Semantic badges are filled with token pairs so small text always meets WCAG AA.
export const badgeVariants = tv({
  base: 'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'border-border text-foreground',
      success: 'border-transparent bg-success text-success-foreground',
      warning: 'border-transparent bg-warning text-warning-foreground',
      destructive: 'border-transparent bg-destructive text-destructive-foreground',
      info: 'border-transparent bg-info text-info-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
