<script lang="ts">
import { ArrowUp, LoaderCircle, Paperclip, Square } from '@lucide/svelte';
import { AI_MODELS, type AiModel } from '@protoyard/ai';
import { onMount } from 'svelte';
import { Tag } from 'texuli/badge';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import { Textarea } from 'texuli/input';
import { Select } from 'texuli/select';
import type { AssistantSendInput } from '../types.ts';

interface Props {
  models?: readonly AiModel[];
  modelId?: string;
  value?: string;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  slashCommands?: readonly string[];
  mentions?: readonly { id: string; label: string }[];
  onModelChange?: (modelId: string) => void;
  onSubmit: (input: AssistantSendInput) => unknown;
  onStop?: () => void;
}

let {
  models = AI_MODELS,
  modelId = models[0]?.id ?? '',
  value = $bindable(''),
  streaming = false,
  disabled = false,
  placeholder = 'Ask anything',
  slashCommands = ['/summarize', '/brainstorm', '/explain'],
  mentions = [],
  onModelChange,
  onSubmit,
  onStop,
}: Props = $props();

let files = $state<File[]>([]);
let error = $state('');
/** `onSubmit` is in flight (simulated latency before the stream starts): show it, block resends. */
let sending = $state(false);
const waiting = $derived(sending && !streaming);
let activeSuggestion = $state(0);
let textarea = $state<HTMLElement | null>(null);
const modelItems = $derived(
  models.map((model) => ({ value: model.id, label: `${model.name} · Simulated` }))
);
const trigger = $derived(/(?:^|\s)([/@][\w-]*)$/.exec(value));
const suggestions = $derived.by(() => {
  if (!trigger?.[1]) return [];
  const token = trigger[1].toLowerCase();
  if (token.startsWith('/')) {
    return slashCommands
      .filter((command) => command.toLowerCase().startsWith(token))
      .slice(0, 6)
      .map((command) => ({ id: command, label: command, kind: 'command' as const }));
  }
  return mentions
    .filter((mention) => mention.label.toLowerCase().startsWith(token.slice(1)))
    .slice(0, 6)
    .map((mention) => ({ ...mention, kind: 'mention' as const }));
});
const selectedModel = $derived(models.find((model) => model.id === modelId));

function chooseSuggestion(item: (typeof suggestions)[number]): void {
  if (!trigger?.[1] || !textarea) return;
  const start = value.lastIndexOf(trigger[1]);
  const insertion = item.kind === 'mention' ? `@${item.label} ` : `${item.label} `;
  value = `${value.slice(0, start)}${insertion}`;
  activeSuggestion = 0;
  requestAnimationFrame(() => textarea?.focus());
}

async function submit(): Promise<void> {
  if (streaming) {
    onStop?.();
    return;
  }
  const prompt = value.trim();
  if (!prompt || !selectedModel || disabled || sending) return;
  error = '';
  sending = true;
  try {
    const result = await onSubmit({ prompt, model: selectedModel, attachments: files });
    if (result !== false) {
      value = '';
      files = [];
    }
  } catch {
    error = 'The message could not be sent. Your draft is still here.';
  } finally {
    sending = false;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && streaming) {
    event.preventDefault();
    event.stopPropagation();
    onStop?.();
    return;
  }
  if (suggestions.length && event.key === 'ArrowDown') {
    event.preventDefault();
    activeSuggestion = (activeSuggestion + 1) % suggestions.length;
    return;
  }
  if (suggestions.length && event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestion = (activeSuggestion - 1 + suggestions.length) % suggestions.length;
    return;
  }
  if (suggestions.length && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    const item = suggestions[activeSuggestion];
    if (item) chooseSuggestion(item);
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit();
  }
}

function addFiles(event: Event): void {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement) || !input.files) return;
  files = [...files, ...Array.from(input.files)];
  input.value = '';
}

/*
 * The attachment picker: Texuli's IconButton opens a hidden file input.
 * Texuli ships no button-style file picker (FileUpload is a dropzone without
 * add/remove callbacks, gap G8), so the input is created here and kept in the
 * composer, named "Choose attachments".
 */
let root = $state<HTMLDivElement | null>(null);
let picker: HTMLInputElement | null = null;
onMount(() => {
  if (!root) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  input.tabIndex = -1;
  input.setAttribute('aria-label', 'Choose attachments');
  input.addEventListener('change', addFiles);
  root.append(input);
  picker = input;
  return () => {
    input.removeEventListener('change', addFiles);
    input.remove();
    picker = null;
  };
});
</script>

<!--
  Built from texuli parts rather than @texuli/chat's Composer: that one has no
  stop state, no textarea keydown or ref for the slash/mention list, and no
  slot for the model choice (Texuli gap, see the lane-C map).
-->
<div bind:this={root} class="@container relative mx-auto w-full max-w-3xl rounded-3xl border border-border bg-surface shadow-soft focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
  {#if suggestions.length}
    <div class="absolute bottom-full left-3 z-10 mb-2 max-h-52 w-64 overflow-y-auto rounded-xl border border-border bg-elevated p-1 shadow-float" role="listbox" aria-label={trigger?.[1]?.startsWith('/') ? 'Slash commands' : 'People'}>
      {#each suggestions as item, index (`${item.kind}-${item.id}`)}
        <Button variant="ghost" role="option" aria-selected={index === activeSuggestion} class={`w-full justify-start ${index === activeSuggestion ? 'bg-muted' : ''}`} onclick={() => chooseSuggestion(item)}>{item.kind === 'mention' ? `@${item.label}` : item.label}</Button>
      {/each}
    </div>
  {/if}
  <label for="assistant-prompt" class="sr-only">Message the simulated assistant</label>
  <Textarea
    bind:ref={textarea}
    bind:value
    id="assistant-prompt"
    rows={1}
    {placeholder}
    {disabled}
    aria-describedby="assistant-composer-hint"
    class="max-h-52 min-h-14 w-full resize-y rounded-none border-0 bg-transparent px-5 pt-4 text-sm leading-6 shadow-none focus-visible:ring-0"
    onkeydown={handleKeydown}
  />
  <span id="assistant-composer-hint" class="sr-only">Press Enter to send. Shift plus Enter starts a new line. Type slash for commands or at sign to mention a person.</span>
  {#if files.length}
    <ul class="flex flex-wrap gap-2 px-4 pb-2" aria-label="Attachments">
      {#each files as file, index (`${file.name}-${index}`)}
        <li><Tag label={file.name} removeLabel="Remove" onRemove={() => (files = files.filter((_, itemIndex) => itemIndex !== index))} /></li>
      {/each}
    </ul>
  {/if}
  <div class="flex min-h-12 items-center gap-2 px-3 pb-3">
    <IconButton variant="ghost" class="rounded-full" label="Attach files" {disabled} onclick={() => picker?.click()}>
      <LucideIcon icon={Paperclip} size="sm" />
    </IconButton>
    <label for="assistant-model" class="sr-only">Simulated model</label>
    <Select.Root
      value={modelId}
      items={modelItems}
      disabled={disabled || streaming || !onModelChange}
      onValueChange={(id) => onModelChange?.(id)}
    >
      <Select.Trigger id="assistant-model" aria-label="Simulated model" size="sm" class="min-w-0 max-w-48 rounded-full text-xs text-muted-foreground">
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {#each modelItems as item (item.value)}
          <Select.Item value={item.value} label={item.label}>{item.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <span class="ml-auto hidden text-[0.7rem] text-muted-foreground @md:inline">Simulated AI · no provider connection</span>
    <!-- Pending is the composer's own (Enter submits too), so the button does not track the promise. -->
    <IconButton
      class="shrink-0 rounded-full"
      autoLoading={false}
      disabled={streaming ? !onStop : waiting || !value.trim() || disabled || !selectedModel}
      aria-busy={waiting || undefined}
      label={streaming ? 'Stop response' : waiting ? 'Sending message' : 'Send message'}
      onclick={submit}
    >
      {#if streaming}<LucideIcon icon={Square} size="sm" class="fill-current" />{:else if waiting}<span class="inline-flex" data-composer-sending><LucideIcon icon={LoaderCircle} size="md" class="motion-safe:animate-spin" /></span>{:else}<LucideIcon icon={ArrowUp} size="md" />{/if}
    </IconButton>
  </div>
  {#if error}<p class="px-5 pb-3 text-xs text-destructive" role="alert">{error}</p>{/if}
</div>
