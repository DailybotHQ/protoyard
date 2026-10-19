<script lang="ts">
import { ArrowLeft, Database, Save, ShieldCheck, Sparkles } from '@lucide/svelte';
import { useAssistant } from '../lib/context.ts';

const { settings, services } = useAssistant();
let customInstructions = $state('');
let memory = $state('');
let memoryEnabled = $state(true);
let dataControls = $state<'standard' | 'private'>('standard');
let monthlyLimit = $state(1_000_000);
let notice = $state('');
let noticeIsError = $state(false);
let currentSettingsAt = '';

$effect(() => {
  const current = settings.current;
  if (!current || current.updatedAt === currentSettingsAt) return;
  currentSettingsAt = current.updatedAt;
  customInstructions = current.customInstructions;
  memory = current.memory;
  memoryEnabled = current.memoryEnabled;
  dataControls = current.dataControls;
  monthlyLimit = current.monthlyLimit;
});

async function save(event: SubmitEvent) {
  event.preventDefault();
  notice = '';
  try {
    await services.saveSettings({
      customInstructions,
      memory,
      memoryEnabled,
      dataControls,
      monthlyLimit: Number(monthlyLimit),
    });
    notice = 'Settings saved in this prototype workspace.';
    noticeIsError = false;
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Settings could not be saved.';
    noticeIsError = true;
  }
}

async function clearWorkspace() {
  if (
    !window.confirm(
      'Clear this local prototype workspace? Its projects, conversations and messages will be removed from this browser.'
    )
  )
    return;
  try {
    await services.clearWorkspace();
    notice = 'Local workspace data cleared. Reload or choose a scenario to start again.';
    noticeIsError = false;
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Workspace data could not be cleared.';
    noticeIsError = true;
  }
}

async function clearMemory() {
  try {
    await services.clearMemory();
    notice = 'Saved memory cleared.';
    noticeIsError = false;
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Memory could not be cleared.';
    noticeIsError = true;
  }
}
</script>

<section class="mx-auto w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8" aria-labelledby="settings-title">
  <a href="#/" class="mb-6 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"><ArrowLeft class="size-3.5" aria-hidden="true" /> Back to assistant</a>
  <div class="mb-7 flex items-start gap-3">
    <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Sparkles class="size-5" aria-hidden="true" /></span>
    <div><h1 id="settings-title" class="text-xl font-semibold tracking-tight">Assistant settings</h1><p class="mt-1 text-sm text-muted-foreground">Personalize the simulated assistant and control what this local prototype remembers.</p></div>
  </div>
  {#if notice}<p class={`mb-5 rounded-lg border px-3 py-2 text-sm ${noticeIsError ? 'border-destructive bg-surface text-destructive' : 'border-success bg-surface text-success'}`} role={noticeIsError ? 'alert' : 'status'}>{notice}</p>{/if}

  <form onsubmit={save} class="space-y-7">
    <section class="space-y-4" aria-labelledby="behavior-title">
      <div class="border-b border-border pb-3"><h2 id="behavior-title" class="text-sm font-semibold">How it responds</h2><p class="mt-1 text-xs text-muted-foreground">These instructions are applied locally to deterministic response packs.</p></div>
      <label class="block text-xs font-medium text-muted-foreground" for="custom-instructions">Custom instructions
        <textarea id="custom-instructions" bind:value={customInstructions} maxlength="1200" rows="4" class="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"></textarea>
        <span class="mt-1 block text-[0.68rem] font-normal text-muted-foreground">Up to 1,200 characters. No external model receives this text.</span>
      </label>
    </section>

    <section class="space-y-4" aria-labelledby="memory-title">
      <div class="border-b border-border pb-3"><h2 id="memory-title" class="text-sm font-semibold">Memory</h2><p class="mt-1 text-xs text-muted-foreground">Stored in this prototype's IndexedDB. Simulated roles are UX only, not security.</p></div>
      <label class="flex items-center gap-3 text-sm"><input type="checkbox" bind:checked={memoryEnabled} class="size-4 accent-primary" /> Use saved memory in simulated replies</label>
      <label class="block text-xs font-medium text-muted-foreground" for="memory-content">Saved memory
        <textarea id="memory-content" bind:value={memory} maxlength="1200" rows="3" class="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"></textarea>
      </label>
      <button type="button" class="min-h-9 rounded-lg px-3 text-xs font-medium text-primary hover:bg-muted" onclick={() => void clearMemory()}>Clear saved memory</button>
    </section>

    <section class="space-y-4" aria-labelledby="data-title">
      <div class="border-b border-border pb-3"><h2 id="data-title" class="flex items-center gap-2 text-sm font-semibold"><ShieldCheck class="size-4 text-primary" aria-hidden="true" /> Data controls</h2><p class="mt-1 text-xs text-muted-foreground">Local simulation controls; no account or provider service is connected.</p></div>
      <label class="block text-xs font-medium text-muted-foreground" for="data-mode">Context mode
        <select id="data-mode" bind:value={dataControls} class="mt-2 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"><option value="standard">Standard · include enabled memory</option><option value="private">Private · omit saved memory from prompts</option></select>
      </label>
      <label class="block text-xs font-medium text-muted-foreground" for="usage-limit">Monthly simulated token limit
        <input id="usage-limit" type="number" min="1000" max="10000000" step="1000" bind:value={monthlyLimit} class="mt-2 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
      </label>
      <div class="rounded-xl border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground"><Database class="mr-1 inline size-3.5" aria-hidden="true" /> Conversations, settings, usage and attachments (file names only) stay in this browser's IndexedDB. The assistant uses deterministic response packs and makes no network model calls.</div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <button type="submit" class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Save class="size-4" aria-hidden="true" /> Save settings</button>
      <button type="button" class="min-h-10 rounded-lg border border-destructive/40 px-3 text-xs font-medium text-destructive hover:bg-muted" onclick={() => void clearWorkspace()}>Clear local workspace data</button>
    </div>
  </form>
</section>
