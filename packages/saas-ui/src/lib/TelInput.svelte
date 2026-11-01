<script lang="ts">
import { Input } from '@protoyard/ui';
import type { SchemaFormCustomField } from '@texuli/forms';

/**
 * The `tel` custom field of the phone sign-in form. G131: `@texuli/forms` has
 * no telephone input (its text field sets no `type="tel"` or
 * `inputmode="tel"`), so phones would open the full keyboard. Switch to the
 * Texuli field when it ships one.
 */
let { field }: { field: SchemaFormCustomField } = $props();
const value = $derived(typeof field.value === 'string' ? field.value : '');
</script>

<Input
  {...field.props}
  type="tel"
  inputmode="tel"
  name={field.name}
  value={value}
  required={field.required}
  readonly={field.readOnly}
  autocomplete="tel"
  oninput={(event: Event) => field.setValue((event.currentTarget as HTMLInputElement).value)}
  onblur={() => field.blur()}
/>
