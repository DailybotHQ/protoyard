<script lang="ts">
import { Button, Input } from '@protoyard/ui';
import type { SchemaFormCustomField } from '@texuli/forms';

/**
 * The `simulated-password` custom field of the kit's auth forms.
 *
 * G129: Texuli 0.11.1's `password` type only allows `current-password` and
 * `new-password`, so a browser would offer to save the fake password. Until
 * the bump to 0.11.2 (which allows `off`), the field is a minimal painter:
 * the same Input with `autocomplete="off"` and a show/hide toggle. Switch it
 * to `{ type: 'password', autocomplete: 'off' }` in `passwordField` then.
 */
let { field }: { field: SchemaFormCustomField } = $props();
let revealed = $state(false);
const value = $derived(typeof field.value === 'string' ? field.value : '');
</script>

<div class="flex flex-wrap items-center gap-2">
  <Input
    {...field.props}
    class="min-w-0 flex-1"
    type={revealed ? 'text' : 'password'}
    name={field.name}
    value={value}
    required={field.required}
    readonly={field.readOnly}
    autocomplete="off"
    autocapitalize="off"
    spellcheck={false}
    oninput={(event: Event) => field.setValue((event.currentTarget as HTMLInputElement).value)}
    onblur={() => field.blur()}
  />
  <Button
    type="button"
    variant="ghost"
    size="sm"
    aria-pressed={revealed}
    aria-controls={field.id}
    disabled={field.disabled}
    onclick={() => (revealed = !revealed)}
  >
    {revealed ? 'Hide password' : 'Show password'}
  </Button>
</div>
