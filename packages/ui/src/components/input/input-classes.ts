/** Shared field styling so Input, Textarea, Select and Combobox triggers line up visually. */
export const fieldClasses = [
  'w-full min-w-0 rounded-md border border-input bg-surface text-foreground shadow-soft',
  // 16px text on phones prevents iOS Safari from zooming into focused fields.
  'text-base sm:text-sm placeholder:text-muted-foreground',
  'transition-[border-color,box-shadow] duration-150 outline-none',
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30',
].join(' ');
