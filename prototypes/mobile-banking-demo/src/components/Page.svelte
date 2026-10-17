<script lang="ts">
import { MobileHeader } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import ConditionBanners from './ConditionBanners.svelte';

/** Every screen: sticky mobile header, condition banners, padded content. */
let {
  title,
  subtitle,
  backHref,
  onBack,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  onBack?: () => void;
  actions?: Snippet;
  children: Snippet;
} = $props();
</script>

<MobileHeader {title} {subtitle} {backHref} {onBack} {actions} />
<div class="flex flex-col gap-5 px-4 pt-4 pb-6">
  <ConditionBanners />
  {@render children()}
</div>
