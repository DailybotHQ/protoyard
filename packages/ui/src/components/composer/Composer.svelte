<script lang="ts">
import { Composer as TexuliComposer } from '@texuli/chat';
import type { Snippet } from 'svelte';
import type { HTMLFormAttributes } from 'svelte/elements';
import { useMessages } from 'texuli/i18n';

interface OwnProps {
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
  /** The composer's form (bindable). */
  ref?: HTMLFormElement | null;
}

/** Extra attributes (`data-*`, `id`, handlers) land on the composer's form (Texuli's contract). */
type Props = OwnProps & Omit<HTMLFormAttributes, keyof OwnProps | 'children'>;

let {
  // No fallback: a caller may bind a value that starts undefined (a map entry);
  // a `$bindable('')` would throw (props_invalid_value). Read as ''.
  value = $bindable(),
  placeholder: placeholderProp,
  label: labelProp,
  actions,
  onSubmit,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })); props still win.
const messages = useMessages();
const placeholder = $derived(
  placeholderProp ?? messages('protoyard.ui.composer.placeholder', 'Write a message…')
);
const label = $derived(labelProp ?? messages('protoyard.ui.composer.label', 'Message'));
</script>

<!-- A thin adapter over Texuli's Composer (`@texuli/chat`): Protoyard's `placeholder`, `label` and `actions`. -->
<TexuliComposer bind:value={() => value ?? '', (next) => (value = next)} labels={{ placeholder, input: label }} attachments={actions} {onSubmit} {...rest as Record<string, unknown>} bind:ref />
