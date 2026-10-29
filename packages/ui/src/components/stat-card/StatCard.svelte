<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { Icon } from 'texuli/icons';
import { Stat } from 'texuli/stat';
import type { IconComponent } from '../../lib/types.ts';
import type { Trend } from './trend.ts';

type Props = HTMLAttributes<HTMLElement> & {
  label: string;
  value: string | number;
  /** Change vs. the previous period, e.g. "+12%" or 12 (numbers get a sign). */
  delta?: string | number;
  /** Defaults to the sign of a numeric delta. */
  trend?: Trend;
  /** Which direction is good; `down` suits metrics like churn or latency. */
  positive?: 'up' | 'down';
  hint?: string;
  icon?: IconComponent;
};

let { icon, ...rest }: Props = $props();
// A plain record keeps the spread onto Texuli's Stat a finite type.
const forwarded = $derived(rest as Omit<Props, 'icon'> & Record<string, unknown>);
</script>

<!-- A thin adapter over Texuli's Stat (`texuli/stat`) that takes an icon component. -->
{#snippet statIcon()}
  {#if icon}<Icon {icon} aria-hidden="true" />{/if}
{/snippet}

<Stat icon={icon ? statIcon : undefined} {...forwarded} />
