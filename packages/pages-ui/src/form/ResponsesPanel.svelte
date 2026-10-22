<script lang="ts">
import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import { FORM_CAPABILITIES, type FormResponse, type FormServices } from '@protoyard/pages';
import { liveQuery } from '@protoyard/renderer-svelte';
import { AlertDialog, Button } from '@protoyard/ui';

/**
 * The responses a page form collected: a live list, a CSV download and a
 * guarded clear. It reads and writes only through the @protoyard/pages form
 * services, which assert the simulated `form:read` / `form:admin`
 * capabilities; `can` lets the panel hide what the current persona may not
 * do instead of offering a button that would fail. Roles here are a prototype
 * simulation, not security.
 */
let {
  form,
  services,
  can,
  save = downloadBlob,
  class: className = '',
}: {
  form: FormBlockData;
  services: Pick<FormServices, 'list' | 'exportCsv' | 'clear'>;
  /** The session's capability check (`runtime.session.can`); omit to let the services decide. */
  can?: (capability: string) => boolean;
  /** Delivers the exported CSV; the default downloads it as a file. */
  save?: (blob: Blob, filename: string) => void | Promise<void>;
  class?: string;
} = $props();

const canRead = $derived(can ? can(FORM_CAPABILITIES.read) : true);
const canAdmin = $derived(can ? can(FORM_CAPABILITIES.admin) : true);

const responses = liveQuery<FormResponse[] | null>(
  () => (canRead ? services.list(form.id) : Promise.resolve(null)),
  { initial: undefined, deps: () => [form.id, canRead] }
);

const rows = $derived(responses.current ?? []);
const title = $derived(form.title ?? 'Form');
const filename = $derived(`${form.id}-responses.csv`);

let status = $state('');
let exportError = $state('');
let confirmOpen = $state(false);

const SUBMITTED = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function submittedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${SUBMITTED.format(date)} UTC`;
}

/** A response value as text: lists joined, booleans as Yes/No, empty as an em dash. */
function cell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function responseValue(response: FormResponse, name: string): unknown {
  return Object.hasOwn(response.values, name) ? response.values[name] : undefined;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a turn to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportCsv(): Promise<void> {
  exportError = '';
  status = '';
  try {
    const csv = await services.exportCsv(form.id);
    await save(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
    status = `Exported ${rows.length === 1 ? '1 response' : `${rows.length} responses`} to ${filename}.`;
  } catch (error) {
    exportError = error instanceof Error ? error.message : 'The responses could not be exported.';
  }
}

async function clear(): Promise<void> {
  status = '';
  // Errors propagate: the dialog stays open and shows them.
  const removed = await services.clear(form.id);
  status = `Cleared ${removed === 1 ? '1 response' : `${removed} responses`}.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The responses could not be loaded.';
}
</script>

<section
  class="grid gap-4 rounded-xl border border-border bg-elevated p-4 text-sm text-foreground {className}"
  aria-labelledby="responses-{form.id}"
  data-py-responses-panel
>
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="grid gap-0.5">
      <h2 id="responses-{form.id}" class="m-0 text-base font-semibold">{title} responses</h2>
      <p class="m-0 text-xs text-muted-foreground">Simulated submissions, stored in this browser.</p>
    </div>
    {#if canRead && rows.length > 0}
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={() => exportCsv()}>Download CSV</Button>
        {#if canAdmin}
          <AlertDialog
            bind:open={confirmOpen}
            title="Clear all responses?"
            description={`This deletes ${rows.length === 1 ? 'the 1 response' : `all ${rows.length} responses`} to "${title}" in this simulated prototype. It cannot be undone.`}
            confirmLabel="Clear responses"
            destructive
            onConfirm={clear}
          >
            {#snippet trigger({ props })}
              <Button {...props} variant="destructive" size="sm">Clear…</Button>
            {/snippet}
          </AlertDialog>
        {/if}
      </div>
    {/if}
  </header>

  {#if !canRead}
    <p class="m-0 rounded-md border border-dashed border-border bg-muted/40 p-3 text-muted-foreground" role="note">
      Your simulated role cannot read responses to this form.
    </p>
  {:else if responses.error}
    <p class="m-0 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive" role="alert">
      {errorMessage(responses.error)}
    </p>
  {:else if responses.current === undefined}
    <p class="m-0 text-muted-foreground" role="status" aria-live="polite">Loading responses…</p>
  {:else if rows.length === 0}
    <p class="m-0 rounded-md border border-dashed border-border p-6 text-center text-muted-foreground" data-py-responses-empty>
      No responses yet. Submissions to this form appear here.
    </p>
  {:else}
    <p class="m-0 text-xs text-muted-foreground">{rows.length === 1 ? '1 response' : `${rows.length} responses`}</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- wide tables scroll; keyboard users must reach them (WCAG 2.1.1). -->
    <div class="max-w-full overflow-x-auto rounded-lg border border-border" role="region" aria-label="{title} responses table" tabindex="0">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">{title} responses, oldest first</caption>
        <thead class="bg-muted/70">
          <tr>
            <th scope="col" class="border-b border-border px-3 py-2 font-semibold whitespace-nowrap">Submitted</th>
            {#each form.fields as field (field.name)}
              <th scope="col" class="border-b border-border px-3 py-2 font-semibold">{field.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as response (response.id)}
            <tr class="border-b border-border last:border-0" data-py-response-row>
              <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{submittedAt(response.createdAt)}</td>
              {#each form.fields as field (field.name)}
                <td class="max-w-80 px-3 py-2 break-words">{cell(responseValue(response, field.name))}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if !canAdmin}
      <p class="m-0 text-xs text-muted-foreground">Only a simulated form admin can clear responses.</p>
    {/if}
  {/if}

  <p class="m-0 min-h-4 text-xs text-muted-foreground" role="status" aria-live="polite">{status}</p>
  {#if exportError}
    <p class="m-0 text-xs text-destructive" role="alert">{exportError}</p>
  {/if}
</section>
