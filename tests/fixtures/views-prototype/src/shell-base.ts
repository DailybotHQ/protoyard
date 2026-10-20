import { liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, toast } from '@protoyard/ui';
import { mount } from 'svelte';

// A realistic first screen: every prototype already ships the renderer's
// services and live queries (core, zod, Dexie), the ui Button and toasts.
// Views are measured on top of it.
export const rows = liveQuery(async () => [] as string[], { initial: [] });
mount(Button as never, {
  target: document.getElementById('shell') ?? document.body,
  props: {
    onclick: () => runService(async () => toast.success(`Saved ${rows.current?.length ?? 0}`)),
  } as never,
});
