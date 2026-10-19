<script lang="ts">
import { Button } from '@protoyard/ui';
import { QueryState } from '@protoyard/views-ui/states';

type Mode = 'loading' | 'empty' | 'error' | 'offline' | 'denied' | 'ready';
let mode = $state<Mode>('loading');
const query = $derived({
  current: mode === 'ready' ? ['Prototype ready'] : mode === 'empty' ? [] : undefined,
  loading: mode === 'loading',
  error:
    mode === 'error'
      ? new Error('The sample service did not answer.')
      : mode === 'offline'
        ? new TypeError('Failed to fetch')
        : mode === 'denied'
          ? Object.assign(new Error('Not allowed'), { status: 403 })
          : null,
});
</script>
<div class="space-y-3"><div class="flex flex-wrap gap-2">{#each ['loading', 'empty', 'error', 'offline', 'denied', 'ready'] as value}<Button size="sm" variant="outline" aria-pressed={mode === value} onclick={() => (mode = value as Mode)}>{value}</Button>{/each}</div><QueryState {query} label="Demo data" delayMs={0} onRetry={() => { mode = 'ready'; }}>{#snippet children(rows)}<ul>{#each rows as row}<li>{row}</li>{/each}</ul>{/snippet}</QueryState></div>
