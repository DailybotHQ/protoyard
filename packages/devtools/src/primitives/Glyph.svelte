<script lang="ts">
import type { Component } from 'svelte';
import type { ClassValue } from 'texuli/cx';
import { Icon, type IconComponent, type IconName } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';

let {
  icon,
  class: className,
  label,
  'aria-hidden': ariaHidden,
}: {
  icon: IconName | IconComponent | Component<{ class?: string }>;
  class?: ClassValue;
  label?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
} = $props();
</script>

{#if typeof icon === 'string'}
  <Icon {icon} class={className} {label} aria-hidden={ariaHidden} />
{:else}
  <span class="contents" aria-hidden={ariaHidden}>
    <LucideIcon icon={icon as unknown as IconComponent} class={className} {label} />
  </span>
{/if}
