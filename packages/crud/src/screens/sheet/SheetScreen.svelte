<script lang="ts">
/**
 * A blueprint `sheet` screen: the entity's records as a spreadsheet over
 * `@protoyard/views-ui/sheet`. Each record is a row and each listed field a
 * column; a totals row sums the screen's `totals` with Texuli formulas. An
 * edited cell saves through the entity's update service (permission, schema
 * and transaction like every other edit); a refused edit puts the cell back
 * and says why. Formulas never reach a record.
 */
import type { Blueprint, EntityInput, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { can, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { type SheetDocument, SheetView } from '@protoyard/views-ui/sheet';
import { type EntityListDisplayNames, loadEntityListDisplayNames } from '../../columns.ts';
import { formatEntityHeading } from '../../format.ts';
import { buildSheetModel, type SheetScreenSpec, sheetEdits, sheetPatch } from './model.ts';

let {
  runtime,
  blueprint,
  services,
  screen,
  title,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: SheetScreenSpec;
  title?: string;
} = $props();

function requireEntity(name: string) {
  const found = blueprint.entities.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`sheet screen: unknown entity "${name}"`);
  return found;
}

function requireService(name: string) {
  const found = services[name];
  if (!found) throw new RangeError(`sheet screen: no service for "${name}"`);
  return found;
}

// svelte-ignore state_referenced_locally
const entity = requireEntity(screen.entity);
// svelte-ignore state_referenced_locally
const service = requireService(screen.entity);

// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
let attempt = $state(0);
const rows = liveQuery(() => service.list(), {
  initial: undefined,
  deps: () => [attempt, principal.current?.persona.id],
});

let displayNames = $state<EntityListDisplayNames>({});
$effect(() => {
  void principal.current?.persona.id;
  let cancelled = false;
  void loadEntityListDisplayNames(entity, blueprint, {
    canReadEntity: (name) => runtime.session.can(`${name}:read`),
    listEntity: async (name) => services[name]?.list() ?? [],
    listPersonas: () => runtime.members.list(),
  }).then((names) => {
    if (!cancelled) displayNames = names;
  });
  return () => {
    cancelled = true;
  };
});

const label = $derived(title ?? `${formatEntityHeading(entity)} sheet`);
const model = $derived(buildSheetModel(entity, screen, rows.current ?? [], label, displayNames));
const query = {
  get current() {
    return rows.current === undefined ? undefined : model.document;
  },
  get loading() {
    return rows.loading;
  },
  get error() {
    return rows.error;
  },
};
const canUpdate = $derived(
  can(`${entity.name}:update`, undefined, runtime) ||
    can(`${entity.name}:update:own`, undefined, runtime)
);
let refused = $state('');

/** Saves the record cells an edit changed; anything else is not record data and is put back. */
async function save(next: SheetDocument): Promise<boolean> {
  refused = '';
  const edit = sheetPatch(sheetEdits(model, next));
  if (!edit.ok) {
    refused = edit.message;
    return false;
  }
  try {
    await service.update(edit.id, edit.patch as EntityInput);
  } catch (error) {
    // Schema issues are the record's own rules (required, min, max…): say them here.
    const issues = (error as { issues?: unknown }).issues;
    if (issues && typeof issues === 'object') {
      refused = Object.values(issues as Record<string, string>)[0] ?? 'That value is not allowed.';
      return false;
    }
    throw error;
  }
  return true;
}
</script>

<section class="grid gap-3" aria-labelledby="sheet-screen-title" data-py-sheet-screen={entity.name}>
  <h1 id="sheet-screen-title" class="text-xl font-semibold">{label}</h1>
  <p class="text-sm text-muted-foreground">
    {canUpdate
      ? 'Edit a cell to update its record. Totals follow the records.'
      : 'Your role can read these records but not edit them.'}
  </p>
  <p role="alert" class="text-sm text-destructive empty:hidden">{refused}</p>
  <SheetView
    {query}
    {runtime}
    {label}
    onChange={canUpdate ? save : undefined}
    csvImport={false}
    onRetry={() => (attempt += 1)}
  />
</section>
