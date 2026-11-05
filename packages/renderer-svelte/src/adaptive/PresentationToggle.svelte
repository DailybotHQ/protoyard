<script lang="ts">
import { cx } from 'texuli/cx';
import { useMessages } from 'texuli/i18n';
import { ToggleGroup, ToggleGroupItem } from 'texuli/toggle';
import type { AdaptivePresentationStore, PresentationView } from './presentation.svelte.ts';

/**
 * A two-state "Phone | Desktop" switch for an adaptive presentation store, to
 * place inside the app (a header, a settings row). Choosing a view saves it as
 * the preference; choosing the active one again keeps it. Labels come from the
 * props, else the dictionary (`protoyard.renderer.presentation.*`), else English.
 */
let {
  store,
  label,
  phoneLabel,
  desktopLabel,
  size = 'sm',
  class: className,
}: {
  store: AdaptivePresentationStore;
  label?: string;
  phoneLabel?: string;
  desktopLabel?: string;
  size?: 'sm' | 'md';
  class?: string;
} = $props();

const m = useMessages();

function choose(next: string | string[]): Promise<void> | undefined {
  if (next !== 'phone' && next !== 'desktop') return undefined;
  return store.setPreference(next satisfies PresentationView);
}
</script>

<ToggleGroup
  type="single"
  value={store.view}
  onValueChange={choose}
  {size}
  class={cx('py-presentation-toggle', className)}
  aria-label={label ?? m('protoyard.renderer.presentation.label', 'Presentation')}
  data-py-presentation-toggle
>
  <ToggleGroupItem value="phone">
    {phoneLabel ?? m('protoyard.renderer.presentation.phone', 'Phone')}
  </ToggleGroupItem>
  <ToggleGroupItem value="desktop">
    {desktopLabel ?? m('protoyard.renderer.presentation.desktop', 'Desktop')}
  </ToggleGroupItem>
</ToggleGroup>
