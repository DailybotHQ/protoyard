<script lang="ts">
import { Notice, type NoticeTone } from '@protoyard/ui';

/**
 * The doc tool bar's notices (a failed download, edits with no doc
 * equivalent). Loaded only when one shows, so the reading entry does not
 * carry the alert and its icons.
 */
let {
  tone,
  title,
  text,
  ...rest
}: { tone: NoticeTone; title: string; text: string; [key: `data-${string}`]: unknown } = $props();
</script>

<Notice {tone} {title} {text} {...rest} />
