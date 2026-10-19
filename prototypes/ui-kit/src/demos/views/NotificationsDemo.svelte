<script lang="ts">
import { Button } from '@protoyard/ui';
import { NotificationCenter, type NotificationItem } from '@protoyard/views-ui/notifications';

let rows = $state<NotificationItem[]>([
  {
    id: 'n1',
    kind: 'mention',
    title: 'Ada mentioned you in Launch plan',
    subjectId: 'launch',
    at: '2026-10-19T11:00:00.000Z',
    readAt: null,
  },
  {
    id: 'n2',
    kind: 'assigned',
    title: 'A task was assigned to you',
    subjectId: 'task-1',
    at: '2026-10-18T12:00:00.000Z',
    readAt: null,
  },
]);
const query = $derived({ current: rows, loading: false, error: null });
async function markRead(id: string) {
  await Promise.resolve();
  rows = rows.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row));
}
async function markAll() {
  await Promise.resolve();
  rows = rows.map((row) => ({ ...row, readAt: new Date().toISOString() }));
}
</script>
<div class="space-y-2"><p class="text-sm text-muted-foreground">Sample notification rows are stored in this demo's local state.</p><NotificationCenter {query} onMarkRead={markRead} onMarkAllRead={markAll} now={new Date('2026-10-19T12:00:00Z')} /></div>
