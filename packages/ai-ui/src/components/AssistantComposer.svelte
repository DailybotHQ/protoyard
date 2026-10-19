<script lang="ts">
import { ArrowUp, Paperclip, Square } from '@lucide/svelte';
import { AI_MODELS, type AiModel } from '@protoyard/ai';
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
let activeSuggestion = $state(0);
let textarea = $state<HTMLTextAreaElement | null>(null);
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
  if (!prompt || !selectedModel || disabled) return;
  error = '';
  try {
    const result = await onSubmit({ prompt, model: selectedModel, attachments: files });
    if (result !== false) {
      value = '';
      files = [];
    }
  } catch {
    error = 'The message could not be sent. Your draft is still here.';
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
</script>

<div class="@container relative mx-auto w-full max-w-3xl rounded-3xl border border-border bg-surface shadow-soft focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
  {#if suggestions.length}
    <div class="absolute bottom-full left-3 z-10 mb-2 max-h-52 w-64 overflow-y-auto rounded-xl border border-border bg-elevated p-1 shadow-float" role="listbox" aria-label={trigger?.[1]?.startsWith('/') ? 'Slash commands' : 'People'}>
      {#each suggestions as item, index (`${item.kind}-${item.id}`)}
        <button type="button" role="option" aria-selected={index === activeSuggestion} class="flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onclick={() => chooseSuggestion(item)}>{item.kind === 'mention' ? `@${item.label}` : item.label}</button>
      {/each}
    </div>
  {/if}
  <label for="assistant-prompt" class="sr-only">Message the simulated assistant</label>
  <textarea
    bind:this={textarea}
    bind:value
    id="assistant-prompt"
    rows="1"
    {placeholder}
    {disabled}
    aria-describedby="assistant-composer-hint"
    class="max-h-52 min-h-14 w-full resize-y bg-transparent px-5 pt-4 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
    onkeydown={handleKeydown}
  ></textarea>
  <span id="assistant-composer-hint" class="sr-only">Press Enter to send. Shift plus Enter starts a new line. Type slash for commands or at sign to mention a person.</span>
  {#if files.length}
    <ul class="flex flex-wrap gap-2 px-4 pb-2" aria-label="Attachments">
      {#each files as file, index (`${file.name}-${index}`)}
        <li class="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-2 py-1 text-xs">
          <span class="max-w-44 truncate">{file.name}</span>
          <button type="button" class="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${file.name}`} onclick={() => (files = files.filter((_, itemIndex) => itemIndex !== index))}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="flex min-h-12 items-center gap-2 px-3 pb-3">
    <label class="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring" aria-label="Attach files">
      <Paperclip class="size-4" aria-hidden="true" />
      <input class="sr-only" type="file" multiple aria-label="Choose attachments" onchange={addFiles} />
    </label>
    <label for="assistant-model" class="sr-only">Simulated model</label>
    <select id="assistant-model" class="h-9 min-w-0 max-w-48 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={modelId} disabled={disabled || streaming || !onModelChange} onchange={(event) => onModelChange?.(event.currentTarget.value)}>
      {#each models as model (model.id)}
        <option value={model.id}>{model.name} · Simulated</option>
      {/each}
    </select>
    <span class="ml-auto hidden text-[0.7rem] text-muted-foreground @md:inline">Simulated AI · no provider connection</span>
  <button type="button" class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40" disabled={streaming ? !onStop : !value.trim() || disabled || !selectedModel} aria-label={streaming ? 'Stop response' : 'Send message'} onclick={() => void submit()}>
      {#if streaming}<Square class="size-4 fill-current" aria-hidden="true" />{:else}<ArrowUp class="size-5" aria-hidden="true" />{/if}
    </button>
  </div>
  {#if error}<p class="px-5 pb-3 text-xs text-destructive" role="alert">{error}</p>{/if}
</div>
