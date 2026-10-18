<script lang="ts">
import { Search } from '@lucide/svelte';
import { navigate } from '@protoyard/renderer-svelte';
import { Button, CommandPalette, type CommandPaletteItem } from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';

const { services, blueprint } = useCrudApp();

const navItems: CommandPaletteItem[] = [
  { id: 'nav:/', label: 'Go to Home', group: 'Navigate', keywords: ['home', 'dashboard'] },
  ...blueprint.entities.map((entity) => ({
    id: `nav:/${entity.plural}`,
    label: `Go to ${entity.label ?? entity.plural}`,
    group: 'Navigate',
    keywords: [entity.name, entity.plural, 'list'],
  })),
  { id: 'nav:/members', label: 'Go to Members', group: 'Navigate', keywords: ['team', 'people'] },
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
    const service = services[entity.name];
    if (!service) continue;
    const rows = await service.list().catch(() => []);
    for (const row of rows) {
      const title = String(row[entity.titleField] ?? row.id);
      if (q && !title.toLowerCase().includes(q) && !entity.name.includes(q)) continue;
      out.push({
        id: `row:${entity.name}:${row.id}`,
        label: title,
        group: entity.label ?? entity.plural,
        keywords: [entity.name, title.toLowerCase()],
      });
      if (out.length > 40) return out;
    }
  }
  return out;
}

function onSelect(item: CommandPaletteItem) {
  if (item.id.startsWith('nav:')) {
    navigate(item.id.slice('nav:'.length));
    return;
  }
  const [, entityName, ...idParts] = item.id.split(':');
  const entity = blueprint.entities.find((candidate) => candidate.name === entityName);
  if (!entity || !idParts.length) return;
  navigate(`/${entity.plural}/${encodeURIComponent(idParts.join(':'))}`);
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

<CommandPalette
  {search}
  {onSelect}
  recentItems={navItems}
  placeholder={`Search ${blueprint.entities.map((entity) => entity.plural).join(', ')}…`}
/>
