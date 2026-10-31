<script lang="ts">
import { Composer as TexuliComposer } from '@texuli/chat';
import type { Snippet } from 'svelte';

interface Props {
  value?: string;
  /** Return `false` (or reject) to keep the draft, e.g. on validation failure. */
  onSubmit: (value: string) => unknown;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** External sending state; async `onSubmit` also shows it automatically. */
  sending?: boolean;
  maxRows?: number;
  maxLength?: number;
  /** Extra controls beside the send button (attach, emoji…). */
  actions?: Snippet;
  class?: string;
}

let {
  // No fallback: a caller may bind a value that starts undefined (a map entry);
  // a `$bindable('')` would throw (props_invalid_value). Read as ''.
  value = $bindable(),
  placeholder = 'Write a message…',
  label = 'Message',
  actions,
  ...rest
}: Props = $props();
</script>

<!-- A thin adapter over Texuli's Composer (`@texuli/chat`): Protoyard's `placeholder`, `label` and `actions`. -->
<TexuliComposer bind:value={() => value ?? '', (next) => (value = next)} labels={{ placeholder, input: label }} attachments={actions} {...rest} />
