<script lang="ts">
import type { Formats } from './model.ts';
import { type CalendarItem, TONE_CLASSES } from './types.ts';

/**
 * One occurrence. Click or Enter opens it; Space grabs it for keyboard moves
 * (handled by CalendarView); a pointer drag moves it, and the bottom edge
 * resizes it when `resizable`.
 */
let {
  item,
  fmt,
  editable = false,
  resizable = false,
  compact = false,
  style,
  onOpen,
  onDragStart,
}: {
  item: CalendarItem;
  fmt: Formats;
  editable?: boolean;
  resizable?: boolean;
  compact?: boolean;
  style?: string;
  onOpen: (key: string) => void;
  onDragStart: (event: PointerEvent, key: string, kind: 'move' | 'resize') => void;
} = $props();

const span = $derived(fmt.span(item));
</script>

<div
  class={[
    'relative overflow-hidden rounded-md border border-border border-l-4 text-left text-xs text-foreground',
    TONE_CLASSES[item.tone],
    item.pending && 'opacity-60',
    item.grabbed && 'z-10 ring-2 ring-ring',
  ]}
  {style}
>
  <button
    type="button"
    class="block h-full w-full cursor-pointer px-1.5 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    data-key={item.key}
    aria-label={`${item.title}, ${span}${item.recurring ? ', repeats' : ''}${item.pending ? ', saving' : ''}`}
    aria-busy={item.pending || undefined}
    aria-roledescription={editable ? 'draggable event' : undefined}
    aria-pressed={item.grabbed || undefined}
    onclick={() => onOpen(item.key)}
    onpointerdown={editable ? (e) => onDragStart(e, item.key, 'move') : undefined}
  >
    <span class="block truncate font-medium">{item.title}</span>
    {#if !compact}<span class="block truncate text-muted-foreground">{span}</span>{/if}
  </button>
  {#if resizable && editable && !item.allDay}
    <span
      class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
      aria-hidden="true"
      data-resize
      onpointerdown={(e) => onDragStart(e, item.key, 'resize')}
    ></span>
  {/if}
</div>
