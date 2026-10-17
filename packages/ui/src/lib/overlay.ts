/** Shared surface styling for floating layers (menus, listboxes, popovers). */
export const floatingSurface =
  'z-50 rounded-lg border border-border bg-elevated text-foreground shadow-float outline-none ui-anim-pop';

/** Shared row styling for highlighted listbox/menu items driven by Bits data attributes. */
export const floatingItem = [
  'relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none',
  'min-h-touch sm:min-h-8',
  'data-highlighted:bg-muted data-highlighted:text-foreground',
  'data-disabled:pointer-events-none data-disabled:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0',
].join(' ');

export const overlayBackdrop =
  'fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px] ui-anim-fade';
