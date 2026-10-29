<script lang="ts" generics="T extends string">
import { RadioGroup, RadioGroupItem } from '@protoyard/ui';

/**
 * Segmented control built on Texuli radio parts, preserving radio semantics
 * and arrow-key selection while matching the compact segmented appearance.
 */
let {
  label,
  options,
  value = $bindable(),
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange?: (value: T) => void;
} = $props();

const uid = $props.id();
const name = `seg-${uid}`;

function select(next: string): void {
  value = next as T;
  onChange?.(value);
}
</script>

<RadioGroup
  aria-label={label}
  {name}
  orientation="horizontal"
  variant="card"
  class="ui-segmented min-w-0"
  value={value ?? ''}
  onValueChange={select}
>
  {#each options as option (option.value)}
    <RadioGroupItem
      value={option.value}
      label={option.label}
      card
      class="ui-segmented-option"
    />
  {/each}
</RadioGroup>

<style>
  :global(.ui-segmented.tx-radio-group) {
    gap: 0.25rem;
    border-radius: 0.75rem;
    background: var(--tx-muted, #f1f1f1);
    padding: 0.25rem;
  }

  :global(.ui-segmented .ui-segmented-option) {
    min-inline-size: 0;
    min-block-size: 2.75rem;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0.5rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    text-align: center;
  }

  :global(.ui-segmented .ui-segmented-option:has([data-state='checked'])) {
    border-color: transparent;
    background: var(--tx-surface, Canvas);
    box-shadow: var(--tx-shadow-soft, 0 1px 2px rgb(0 0 0 / 8%));
  }

  :global(.ui-segmented .tx-radio-card__control) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  :global(.ui-segmented .ui-segmented-option .tx-choice__label) {
    font-size: var(--tx-font-size-sm, 0.875rem);
    font-weight: var(--tx-font-weight-medium, 500);
  }
</style>
