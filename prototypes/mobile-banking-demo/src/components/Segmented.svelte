<script lang="ts" generics="T extends string">
import { Input } from '@protoyard/ui';

/**
 * Segmented control built on native radio inputs, so arrow keys, labels
 * and screen readers work without extra code.
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
</script>

<fieldset class="min-w-0">
  <legend class="sr-only">{label}</legend>
  <div class="flex rounded-xl bg-muted p-1">
    {#each options as option (option.value)}
      <label
        class={[
          'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
          value === option.value
            ? 'bg-surface text-foreground shadow-soft'
            : 'text-muted-foreground hover:text-foreground',
        ]}
      >
        <Input
          type="radio"
          class="sr-only"
          {name}
          value={option.value}
          checked={value === option.value}
          onchange={() => {
            value = option.value;
            onChange?.(option.value);
          }}
        />
        {option.label}
      </label>
    {/each}
  </div>
</fieldset>
