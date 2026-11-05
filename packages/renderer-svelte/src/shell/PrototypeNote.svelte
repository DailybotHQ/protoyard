<script lang="ts">
import { chromeMessages, formatMessage } from '../messages.ts';

/**
 * The "Prototype · simulated data" note as plain text in the page flow, for an
 * app that wants the honest label in its own layout (a footer, under a
 * heading) instead of the floating badge. Turn the badge off with
 * `demoBadge: false` and place this where it reads naturally. It uses the
 * badge's chrome messages, so `mountPrototype({ messages: { badge } })`
 * translates both.
 */
let { name = '', class: className }: { name?: string; class?: string } = $props();
const messages = chromeMessages().badge;
</script>

<p
  data-py-prototype-note
  class={['text-xs text-muted-foreground', className]}
  title={name ? formatMessage(messages.title, { name }) : undefined}
>
  <span class="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle" aria-hidden="true"></span>
  {messages.text}
</p>
