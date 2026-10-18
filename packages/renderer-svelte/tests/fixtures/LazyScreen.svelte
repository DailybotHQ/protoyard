<script lang="ts">
let {
  params = {},
  path = '',
}: {
  params?: Record<string, string>;
  query?: URLSearchParams;
  path?: string;
  [key: string]: unknown;
} = $props();
</script>

<div data-testid="lazy-screen" data-path={path}>
  Lazy screen{params.id ? ` #${params.id}` : ''}
</div>
