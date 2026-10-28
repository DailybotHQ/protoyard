<script lang="ts">
import { onMount } from 'svelte';
import { applyTheme, readThemeChoice, type ThemeChoice } from '@/lib/theme';

let choice = $state<ThemeChoice>('system');
let hydrated = $state(false);
const options = [
  { value: 'light', label: 'Light theme', glyph: '☼' },
  { value: 'dark', label: 'Dark theme', glyph: '◐' },
  { value: 'system', label: 'Match system theme', glyph: '◉' },
] as const;

onMount(() => {
  choice = readThemeChoice();
  hydrated = true;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (choice === 'system') applyTheme('system');
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
});

function select(value: ThemeChoice): void {
  choice = value;
  applyTheme(value);
}
</script>

<div role="group" aria-label="Color theme" data-hydrated={hydrated} class="flex rounded-lg border border-line bg-surface p-0.5">
  {#each options as option (option.value)}
    <button
      type="button"
      class="grid size-7 place-items-center rounded-md text-muted transition-colors hover:text-fg aria-pressed:bg-surface-2 aria-pressed:text-fg"
      aria-pressed={choice === option.value}
      aria-label={option.label}
      title={option.label}
      onclick={() => select(option.value)}
    >
      <span aria-hidden="true">{option.glyph}</span>
    </button>
  {/each}
</div>
