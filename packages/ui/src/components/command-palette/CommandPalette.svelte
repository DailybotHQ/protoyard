<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { CommandPalette as TexuliCommandPalette } from 'texuli/command';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import type { CommandPaletteItem, CommandPaletteSearch, CommandPaletteSelect } from './types.ts';

interface OwnProps {
  /** The palette's content element while open, `null` while closed (bindable). */
  ref?: HTMLElement | null;
  /** Open state (bindable). ⌘K / Ctrl+K toggles it as well. */
  open?: boolean;
  search: CommandPaletteSearch;
  onSelect: CommandPaletteSelect;
  recentItems?: CommandPaletteItem[];
  debounceMs?: number;
  placeholder?: string;
  class?: string;
}

/** Extra attributes (`data-*`, `aria-*`, `id`, handlers…) land on the palette's content element. */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

let {
  search,
  onSelect,
  recentItems = [],
  debounceMs = 150,
  placeholder = 'Search pages, people, and actions…',
  class: className,
  ref = $bindable(null),
  open = $bindable(false),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();
</script>

<!--
  Texuli's styled CommandPalette (⌘K / Ctrl+K, debounced search, recent
  items, grouped results, "Searching…" status, focus return), inside a framed
  device or the top layer. Its search box keeps the name "Search commands",
  which hosts and tests address, apart from the dialog's title (G108).
-->
<TexuliCommandPalette
  {...rest}
  bind:ref
  bind:open
  mode={portal.mode}
  container={portal.container}
  {search}
  onSelect={(item) => onSelect(item as CommandPaletteItem)}
  {recentItems}
  {debounceMs}
  {placeholder}
  title="Command palette"
  searchLabel="Search commands"
  description="Search or choose a recent action. Use the arrow keys to move and Enter to select."
  emptyLabel="No results found."
  recentEmptyLabel="No recent items."
  loadingLabel="Searching…"
  errorLabel="Search is unavailable. Try again."
  size="md"
  class={className}
/>
