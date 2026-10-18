<script lang="ts">
interface Props {
  unreadCount?: number;
  onopen?: () => void;
  label?: string;
}

let { unreadCount = 0, onopen, label = 'Open simulated inbox' }: Props = $props();
</script>

<button
  type="button"
  class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  aria-label={unreadCount > 0 ? `${label}, ${unreadCount} unread messages` : label}
  onclick={onopen}
>
  <span aria-hidden="true">✉</span>
  <span>Inbox</span>
  {#if unreadCount > 0}
    <span class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground" aria-hidden="true">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  {/if}
</button>
