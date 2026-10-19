<script lang="ts">
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FoldHorizontal,
  FoldVertical,
  GripVertical,
  UnfoldHorizontal,
  UnfoldVertical,
} from '@lucide/svelte';
import {
  compactLayout,
  type DashboardLayout,
  type DashboardWidget,
  type MoveDirection,
  moveWidget,
  readingOrder,
  resizeWidget,
} from '@protoyard/analytics';
import { Button } from '@protoyard/ui';
import { type Snippet, tick, untrack } from 'svelte';

type Props = {
  /** The saved layout (data); the grid always shows it compacted. */
  layout: DashboardLayout;
  /** Accessible name of the dashboard region. */
  label: string;
  /** Edit mode: move and resize controls on every widget. */
  editing?: boolean;
  /**
   * Called with the new layout after every edit. Return the service promise:
   * the grid shows the change at once, marks itself busy until it settles,
   * and restores the previous layout if it rejects.
   */
  onchange?: (layout: DashboardLayout) => unknown;
  /** Renders one widget (usually a WidgetCard). */
  widget: Snippet<[DashboardWidget]>;
  /** Height of one row unit in CSS pixels. */
  rowHeight?: number;
  /** Gap between widgets in CSS pixels. */
  gap?: number;
  /** Below this container width the grid becomes a single column in reading order. */
  collapseBelow?: number;
  class?: string;
};

let {
  layout,
  label,
  editing = false,
  onchange,
  widget,
  rowHeight = 80,
  gap = 16,
  collapseBelow = 640,
  class: className = '',
}: Props = $props();

let draft = $state<DashboardLayout>([]);
let pending = $state(false);
let announcement = $state('');
let width = $state(0);
let container = $state<HTMLDivElement | null>(null);
const uid = $props.id();

// The saved layout wins whenever it changes (a scenario load, another tab, a saved edit).
$effect.pre(() => {
  const next = compactLayout(layout);
  untrack(() => {
    draft = next;
  });
});

$effect(() => {
  const el = container;
  if (!el) return;
  return untrack(() => {
    width = Math.floor(el.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver((entries) => {
      width = Math.floor(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });
});

const narrow = $derived(width > 0 && width < collapseBelow);
const ordered = $derived(readingOrder(draft));

const name = (item: DashboardWidget) => item.title ?? item.widget;
const position = (item: DashboardWidget) =>
  `column ${item.x + 1}, row ${item.y + 1}, ${item.w} columns wide, ${item.h} rows tall`;

async function apply(
  next: DashboardLayout,
  id: string,
  verb: string,
  refocus: boolean
): Promise<void> {
  if (pending) return;
  const before = draft;
  const moved = next.find((w) => w.id === id);
  const unchanged =
    moved &&
    before.find(
      (w) => w.id === id && w.x === moved.x && w.y === moved.y && w.w === moved.w && w.h === moved.h
    );
  if (!moved || unchanged) {
    announcement = `${moved ? name(moved) : 'Widget'} cannot ${verb} further`;
    return;
  }
  draft = next;
  announcement = `${name(moved)} ${verb === 'move' ? 'moved' : 'resized'}: ${position(moved)}`;
  if (refocus) {
    // Reordering the keyed list can move the focused node; keep focus on the widget.
    await tick();
    container?.querySelector<HTMLElement>(`[data-widget-handle="${CSS.escape(id)}"]`)?.focus();
  }
  if (!onchange) return;
  pending = true;
  try {
    await onchange(next);
  } catch {
    draft = before;
    announcement = 'The layout could not be saved; the previous layout is back';
  } finally {
    pending = false;
  }
}

const move = (id: string, direction: MoveDirection, refocus = false) =>
  apply(moveWidget(draft, id, direction), id, 'move', refocus);
const resize = (id: string, change: { dw?: number; dh?: number }, refocus = false) =>
  apply(resizeWidget(draft, id, change), id, 'resize', refocus);

function onkeydown(event: KeyboardEvent, id: string) {
  if (!editing) return;
  const directions: Record<string, MoveDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  if (event.shiftKey) {
    const change = { up: { dh: -1 }, down: { dh: 1 }, left: { dw: -1 }, right: { dw: 1 } }[
      direction
    ];
    void resize(id, change, true);
  } else {
    void move(id, direction, true);
  }
}

const controls: { label: string; icon: typeof ArrowUp; run: (id: string) => Promise<void> }[] = [
  { label: 'Move up', icon: ArrowUp, run: (id) => move(id, 'up') },
  { label: 'Move down', icon: ArrowDown, run: (id) => move(id, 'down') },
  { label: 'Move left', icon: ArrowLeft, run: (id) => move(id, 'left') },
  { label: 'Move right', icon: ArrowRight, run: (id) => move(id, 'right') },
  { label: 'Narrower', icon: FoldHorizontal, run: (id) => resize(id, { dw: -1 }) },
  { label: 'Wider', icon: UnfoldHorizontal, run: (id) => resize(id, { dw: 1 }) },
  { label: 'Shorter', icon: FoldVertical, run: (id) => resize(id, { dh: -1 }) },
  { label: 'Taller', icon: UnfoldVertical, run: (id) => resize(id, { dh: 1 }) },
];
</script>

<div
  bind:this={container}
  role="region"
  aria-label={label}
  aria-busy={pending ? 'true' : undefined}
  data-columns={narrow ? 1 : 12}
  data-editing={editing ? '' : undefined}
  class="grid w-full min-w-0 {className}"
  style:grid-template-columns={narrow ? 'minmax(0, 1fr)' : 'repeat(12, minmax(0, 1fr))'}
  style:grid-auto-rows="{rowHeight}px"
  style:gap="{gap}px"
>
  {#each ordered as item (item.id)}
    <div
      data-widget-id={item.id}
      class="relative flex min-h-0 min-w-0 flex-col rounded-xl {editing
        ? 'outline-2 outline-offset-2 outline-dashed outline-border focus-within:outline-ring'
        : ''}"
      style:grid-column={narrow ? '1 / -1' : `${item.x + 1} / span ${item.w}`}
      style:grid-row={narrow ? `span ${item.h}` : `${item.y + 1} / span ${item.h}`}
    >
      {@render widget(item)}
      {#if editing}
        <div
          class="absolute top-2 right-2 z-10 flex flex-wrap gap-0.5 rounded-lg border border-border bg-elevated p-0.5 shadow-soft"
          role="toolbar"
          aria-label="Arrange {name(item)}"
        >
          <button
            type="button"
            data-widget-handle={item.id}
            class="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="{name(item)}, {position(item)}"
            aria-describedby="{uid}-keys"
            aria-disabled={pending ? 'true' : undefined}
            onkeydown={(event) => onkeydown(event, item.id)}
          >
            <GripVertical class="size-4" aria-hidden="true" />
          </button>
          {#each controls as control (control.label)}
            <Button
              variant="ghost"
              size="icon"
              class="size-7 min-h-0 min-w-0 text-sm"
              aria-label="{control.label}: {name(item)}"
              title={control.label}
              disabled={pending}
              onclick={() => control.run(item.id)}
            >
              <control.icon class="size-3.5" aria-hidden="true" />
            </Button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
<p id="{uid}-keys" class="sr-only">Arrow keys move the widget; Shift and arrow keys resize it.</p>
<p class="sr-only" aria-live="polite">{announcement}</p>
