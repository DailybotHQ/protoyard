<script lang="ts">
import type { Blueprint } from '@protoyard/blueprint';
import { type EntitySearchMatch, searchEntities } from '@protoyard/blueprint/search';
import type { PrototypeRuntime } from '@protoyard/core';
import { navigate } from '@protoyard/renderer-svelte';
import { CommandPalette, type CommandPaletteItem } from '@protoyard/ui';

interface Props {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  limitPerEntity?: number;
  onNavigate?: (match: EntitySearchMatch) => void;
}

let { runtime, blueprint, limitPerEntity = 10, onNavigate }: Props = $props();

const matchesByItemId = new Map<string, EntitySearchMatch>();

async function search(query: string): Promise<CommandPaletteItem[]> {
  const matches = await searchEntities(runtime, blueprint, query, { limitPerEntity });
  matchesByItemId.clear();
  return matches.map((match) => {
    const id = `${match.entityName}:${match.recordId}`;
    matchesByItemId.set(id, match);
    return {
      id,
      label: match.title,
      group: match.entityLabel,
      description: `Matches ${match.matchedFields.join(', ')} · ${match.recordId}`,
    };
  });
}

function defaultPath(match: EntitySearchMatch): string {
  const entity = blueprint.entities.find((item) => item.name === match.entityName);
  if (!entity) return '/';

  const detail = blueprint.screens.find(
    (screen) => screen.type === 'detail' && screen.entity === match.entityName
  );
  const list = blueprint.screens.find(
    (screen) => screen.type === 'list' && screen.entity === match.entityName
  );
  if (detail) {
    const path = detail.path ?? `/${entity.plural}/:id`;
    return path.includes(':id')
      ? path.replace(':id', encodeURIComponent(match.recordId))
      : `${path}?id=${encodeURIComponent(match.recordId)}`;
  }

  const path = list?.path ?? `/${entity.plural}`;
  return `${path}?id=${encodeURIComponent(match.recordId)}`;
}

function select(item: CommandPaletteItem): void {
  const match = matchesByItemId.get(item.id);
  if (!match) return;
  if (onNavigate) onNavigate(match);
  else navigate(defaultPath(match));
}
</script>

<CommandPalette
  {search}
  onSelect={select}
  placeholder="Search all records…"
/>
