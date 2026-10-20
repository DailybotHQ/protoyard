<script lang="ts">
import { MarkdownPreview } from '@protoyard/views-ui/editor';

/**
 * A page body: Markdown rendered by the shared safe parser as elements and
 * text only (never `{@html}`), so script tags, event handlers and
 * `javascript:` links in a page stay inert text.
 */
let { source, label = 'Page content' }: { source: string; label?: string } = $props();
</script>

<MarkdownPreview {source} {label} emptyText="This page is empty." class="max-w-none" />
