<script lang="ts">
/**
 * Host adapter over `@texuli/sheets/view` `SheetView`: a liveQuery of one
 * stored workbook, a service callback that persists every edit, the
 * runtime clock for `TODAY()` and `NOW()`, and CSV download and import.
 *
 * The stored workbook is untrusted data: it is validated (`validateSheet`)
 * before it paints. Texuli rebuilds its workbook (undo history, focus) when
 * it receives a document it did not emit, so an edit that comes back through
 * the service and the query, unchanged, keeps the document the view emitted.
 */
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { csvToSheet, sheetToCsv } from '@texuli/sheets/csv';
import { createWorkbook, type SheetDocument, validateSheet } from '@texuli/sheets/model';
import { SheetView as TexuliSheetView } from '@texuli/sheets/view';
import { FileUpload } from 'texuli/file-upload';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  onChange,
  onRetry,
  label = 'Spreadsheet',
  runtime,
  now,
  readonly = false,
  csv = true,
  activeSheet = $bindable(),
  class: className,
}: {
  query: {
    readonly current: unknown | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  /** Persists the edited workbook (a service). Without it the sheet is read-only. */
  onChange?: (sheet: SheetDocument) => unknown;
  onRetry?: () => unknown;
  label?: string;
  runtime?: PrototypeRuntime;
  /** The clock for `TODAY()` and `NOW()`; default the runtime's simulated clock. */
  now?: Date;
  readonly?: boolean;
  /** Offer "Download CSV" (and "Import CSV" when editable). */
  csv?: boolean;
  activeSheet?: string;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally -- only subscribe when a runtime is in scope
const clock = now || !runtime ? null : useClock(runtime);
const clockNow = () => now ?? clock?.now ?? new Date(0);
const editable = $derived(!readonly && onChange !== undefined);

/** The last document shown, and its JSON, to recognize an edit coming back unchanged. */
let shown = $state.raw<SheetDocument | null>(null);
let shownJson = '';
let invalid = $state<string | null>(null);
let importing = $state(false);
let importError = $state<string | null>(null);
/** Bumped after each pick: the upload zone starts empty again, so another file can be chosen. */
let attempt = $state(0);

$effect.pre(() => {
  const stored = query.current;
  if (stored === undefined) return;
  const json = JSON.stringify(stored);
  if (json === shownJson) return;
  const checked = validateSheet(stored);
  if (!checked.ok) {
    invalid = checked.issues[0]?.message ?? 'The workbook is not a valid sheet.';
    return;
  }
  invalid = null;
  shown = checked.sheet;
  shownJson = json;
});

async function persist(next: SheetDocument): Promise<void> {
  if (!onChange) return;
  const previous = shown;
  const previousJson = shownJson;
  shown = next;
  shownJson = JSON.stringify(next);
  const result = await runService(() => onChange(next));
  // A refused save puts the stored workbook back.
  if (!result.ok || result.value === false) {
    shown = previous;
    shownJson = previousJson;
  }
}

function download(): void {
  if (!shown) return;
  const workbook = createWorkbook(shown, { now: clockNow });
  const sheetId = activeSheet ?? workbook.sheets[0]?.id ?? '';
  const name = workbook.sheet(sheetId)?.name ?? 'sheet';
  const blob = new Blob([sheetToCsv(workbook, sheetId)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(shown.meta?.title ?? name).replace(/[^\w.-]+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** A CSV file becomes a new sheet in the workbook; `=…` fields stay text (untrusted). */
async function importCsv(files: File[]): Promise<void> {
  const file = files[0];
  if (!file || !shown) return;
  importError = null;
  const base = file.name.replace(/\.csv$/i, '').trim() || 'Imported';
  const taken = new Set(shown.sheets.map((sheet) => sheet.name.toLowerCase()));
  let name = base.slice(0, 60);
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 56)} ${n}`;
  const ids = new Set(shown.sheets.map((sheet) => sheet.id));
  let id = 'imported';
  for (let n = 2; ids.has(id); n++) id = `imported-${n}`;
  const imported = csvToSheet(await file.text(), { id, name });
  if (!imported.ok) {
    importError = imported.issues[0]?.message ?? 'The CSV file could not be read.';
    return;
  }
  const next = validateSheet({ ...shown, sheets: [...shown.sheets, ...imported.sheet.sheets] });
  if (!next.ok) {
    importError = next.issues[0]?.message ?? 'The workbook would be too large.';
    return;
  }
  activeSheet = id;
  importing = false;
  await persist(next.sheet);
}
</script>

<div class="grid gap-2" data-py-sheet={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children()}
      {#if invalid}
        <p role="alert" class="rounded-md border border-destructive p-3 text-sm text-destructive">
          This workbook could not be opened: {invalid}
        </p>
      {:else if shown}
        {#if csv}
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label="{label} file actions">
            <Button variant="outline" size="sm" onclick={download}>Download CSV</Button>
            {#if editable}
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={importing}
                onclick={() => {
                  importing = !importing;
                  importError = null;
                }}>Import CSV</Button
              >
            {/if}
          </div>
          {#if editable && importing}
            {#key attempt}
              <FileUpload
                variant="compact"
                accept=".csv,text/csv"
                maxFiles={1}
                labels={{ label: 'Import CSV', description: 'The file becomes a new sheet. Formulas in it stay text.' }}
                onFilesAdd={(picked) => {
                  attempt += 1;
                  void importCsv(picked);
                }}
              />
            {/key}
            {#if importError}<p role="alert" class="text-sm text-destructive">{importError}</p>{/if}
          {/if}
        {/if}
        <TexuliSheetView
          sheet={shown}
          bind:activeSheet
          readonly={!editable}
          {label}
          now={clockNow}
          onchange={(next) => void persist(next)}
          class={className}
        />
      {/if}
    {/snippet}
  </QueryState>
</div>
