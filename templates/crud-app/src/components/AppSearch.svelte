<script lang="ts">
import { Search } from '@lucide/svelte';
import { navigate } from '@protoyard/renderer-svelte';
import { Button, CommandPalette, type CommandPaletteItem } from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';

const { services, blueprint } = useCrudApp();

const navItems: CommandPaletteItem[] = [
  { id: 'nav-projects', label: 'Go to Projects', group: 'Navigate', keywords: ['project', 'list'] },
  { id: 'nav-tasks', label: 'Go to Tasks', group: 'Navigate', keywords: ['task', 'list'] },
  { id: 'nav-members', label: 'Go to Members', group: 'Navigate', keywords: ['team', 'people'] },
];

async function search(query: string): Promise<CommandPaletteItem[]> {
  const q = query.trim().toLowerCase();
  const out: CommandPaletteItem[] = [];
  for (const item of navItems) {
    if (!q || item.label.toLowerCase().includes(q) || item.keywords?.some((k) => k.includes(q))) {
      out.push(item);
    }
  }
  for (const entity of blueprint.entities) {
    const rows = await services[entity.name]!.list();
    for (const row of rows) {
      const title = String(row[entity.titleField] ?? row.id);
      if (q && !title.toLowerCase().includes(q) && !entity.name.includes(q)) continue;
      out.push({
        id: `row:${entity.name}:${row.id}`,
        label: title,
        group: entity.plural,
        keywords: [entity.name, title.toLowerCase()],
      });
      if (out.length > 40) break;
    }
  }
  return out;
}

function onSelect(item: CommandPaletteItem) {
  if (item.id === 'nav-projects') navigate('/projects');
  else if (item.id === 'nav-tasks') navigate('/tasks');
  else if (item.id === 'nav-members') navigate('/members');
  else if (item.id.startsWith('row:project:')) {
    navigate(`/projects/${item.id.slice('row:project:'.length)}`);
  } else if (item.id.startsWith('row:task:')) {
    navigate(`/tasks/${item.id.slice('row:task:'.length)}`);
  }
}

function openShortcut(event: MouseEvent) {
  event.preventDefault();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
}
</script>

<Button size="sm" variant="outline" aria-label="Search workspace (⌘K)" onclick={openShortcut}>
  <Search class="size-4" aria-hidden="true" />
  <span class="hidden sm:inline">Search</span>
  <kbd class="ml-1 hidden rounded border border-border px-1 text-[0.65rem] text-muted-foreground sm:inline">⌘K</kbd>
</Button>

<CommandPalette {search} {onSelect} recentItems={navItems} placeholder="Search projects, tasks…" />
