<script lang="ts">
import Monitor from '@lucide/svelte/icons/monitor';
import Moon from '@lucide/svelte/icons/moon';
import Sun from '@lucide/svelte/icons/sun';
import { onMount } from 'svelte';
import { applyTheme, readThemeChoice, type ThemeChoice } from '@/lib/theme';

let choice = $state<ThemeChoice>('system');

const options = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Match system theme', Icon: Monitor },
] as const;

onMount(() => {
  choice = readThemeChoice();
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  // While on "system", follow OS changes live.
  const onChange = () => {
    if (choice === 'system') applyTheme('system');
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
});

function select(value: ThemeChoice) {
  choice = value;
  applyTheme(value);
}
</script>

<div role="group" aria-label="Color theme" class="flex rounded-lg border border-line bg-surface p-0.5">
  {#each options as option (option.value)}
    <button
      type="button"
      class="grid size-7 place-items-center rounded-md text-muted transition-colors hover:text-fg aria-pressed:bg-surface-2 aria-pressed:text-fg"
      aria-pressed={choice === option.value}
      aria-label={option.label}
      title={option.label}
      onclick={() => select(option.value)}
    >
      <option.Icon size={15} aria-hidden="true" />
    </button>
  {/each}
</div>
