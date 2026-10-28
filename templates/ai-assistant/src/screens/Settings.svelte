<script lang="ts">
import { ArrowLeft, Database, Save, ShieldCheck, Sparkles } from '@lucide/svelte';
import { Button, Checkbox, Input, Select, Textarea } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
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

<section class="mx-auto max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#e9e6ef] bg-white p-5 shadow-sm sm:p-8" aria-labelledby="settings-title">
  <a href="#/" class="mb-6 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-[#716d7f] hover:bg-[#f7f5fa]"><LucideIcon icon={ArrowLeft} class="size-3.5" /> Back to assistant</a>
  <div class="mb-7 flex items-start gap-3">
    <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#eeeafa] text-[#7662ca]"><LucideIcon icon={Sparkles} class="size-5" /></span>
    <div><h1 id="settings-title" class="text-xl font-semibold tracking-tight">Assistant settings</h1><p class="mt-1 text-sm text-[#777386]">Personalize the simulated assistant and control what this local prototype remembers.</p></div>
  </div>
  {#if notice}<p class={`mb-5 rounded-lg border px-3 py-2 text-sm ${noticeIsError ? 'border-[#e9b2a9] bg-[#fff1ee] text-[#8a3125]' : 'border-[#b9dec9] bg-[#eff9f2] text-[#28643f]'}`} role={noticeIsError ? 'alert' : 'status'}>{notice}</p>{/if}

  <form onsubmit={save} class="space-y-7">
    <section class="space-y-4" aria-labelledby="behavior-title">
      <div class="border-b border-[#efedf2] pb-3"><h2 id="behavior-title" class="text-sm font-semibold">How it responds</h2><p class="mt-1 text-xs text-[#817c90]">These instructions are applied locally to deterministic response packs.</p></div>
      <label class="block text-xs font-medium text-[#514d60]" for="custom-instructions">Custom instructions
        <Textarea id="custom-instructions" bind:value={customInstructions} maxlength={1200} rows={4} class="mt-2 w-full resize-y rounded-xl border border-[#e4e1ea] bg-[#fdfcfe] p-3 text-sm font-normal text-[#343044] outline-none focus:border-[#8771d9] focus:ring-2 focus:ring-[#e7e1fa]"></Textarea>
        <span class="mt-1 block text-[0.68rem] font-normal text-[#8b8798]">Up to 1,200 characters. No external model receives this text.</span>
      </label>
    </section>

    <section class="space-y-4" aria-labelledby="memory-title">
      <div class="border-b border-[#efedf2] pb-3"><h2 id="memory-title" class="text-sm font-semibold">Memory</h2><p class="mt-1 text-xs text-[#817c90]">Stored in this prototype's IndexedDB. Simulated roles are UX only, not security.</p></div>
      <label class="flex items-center gap-3 text-sm"><Checkbox bind:checked={memoryEnabled} class="size-4" /> Use saved memory in simulated replies</label>
      <label class="block text-xs font-medium text-[#514d60]" for="memory-content">Saved memory
        <Textarea id="memory-content" bind:value={memory} maxlength={1200} rows={3} class="mt-2 w-full resize-y rounded-xl border border-[#e4e1ea] bg-[#fdfcfe] p-3 text-sm font-normal text-[#343044] outline-none focus:border-[#8771d9] focus:ring-2 focus:ring-[#e7e1fa]"></Textarea>
      </label>
      <Button type="button" class="min-h-9 rounded-lg px-3 text-xs font-medium text-[#6553ae] hover:bg-[#f4f1fb]" onclick={() => void clearMemory()}>Clear saved memory</Button>
    </section>

    <section class="space-y-4" aria-labelledby="data-title">
      <div class="border-b border-[#efedf2] pb-3"><h2 id="data-title" class="flex items-center gap-2 text-sm font-semibold"><LucideIcon icon={ShieldCheck} class="size-4 text-[#7460c8]" /> Data controls</h2><p class="mt-1 text-xs text-[#817c90]">Local simulation controls; no account or provider service is connected.</p></div>
      <label class="block text-xs font-medium text-[#514d60]" for="data-mode">Context mode
        <Select id="data-mode" bind:value={dataControls} class="mt-2 block min-h-10 w-full" items={[{ value: 'standard', label: 'Standard · include enabled memory' }, { value: 'private', label: 'Private · omit saved memory from prompts' }]} />
      </label>
      <label class="block text-xs font-medium text-[#514d60]" for="usage-limit">Monthly simulated token limit
        <Input id="usage-limit" type="number" min={1000} max={10000000} step={1000} bind:value={monthlyLimit} class="mt-2 block min-h-10 w-full rounded-lg border border-[#e4e1ea] bg-white px-3 text-sm font-normal outline-none focus:border-[#8771d9] focus:ring-2 focus:ring-[#e7e1fa]" />
      </label>
      <div class="rounded-xl border border-[#ebe8f0] bg-[#faf9fc] p-3 text-xs leading-5 text-[#777386]"><LucideIcon icon={Database} class="mr-1 inline size-3.5" /> Conversations, settings, usage and attachments (file names only) stay in this browser's IndexedDB. The assistant uses deterministic response packs and makes no network model calls.</div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[#efedf2] pt-5">
      <Button type="submit" class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#302a58] px-4 text-sm font-medium text-white hover:bg-[#403878] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8370db]"><LucideIcon icon={Save} class="size-4" /> Save settings</Button>
      <Button type="button" class="min-h-10 rounded-lg border border-[#e6d1cf] px-3 text-xs font-medium text-[#923e34] hover:bg-[#fff5f3]" onclick={() => void clearWorkspace()}>Clear local workspace data</Button>
    </div>
  </form>
</section>
