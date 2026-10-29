<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';
import { FileUpload } from 'texuli/file-upload';

let {
  accept,
  class: className,
  label,
  hidden = false,
  onchange,
  tabindex = 0,
  ref = $bindable(null),
}: {
  accept: string;
  class?: string;
  label: string;
  hidden?: boolean;
  onchange?: HTMLInputAttributes['onchange'];
  tabindex?: number;
  ref?: HTMLInputElement | null;
} = $props();

let host = $state<HTMLDivElement | null>(null);

function forwardChange(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const inputEvent = new Proxy(event, {
    get(target, key) {
      return key === 'currentTarget' ? input : Reflect.get(target, key, target);
    },
  });
  onchange?.(inputEvent as Parameters<NonNullable<typeof onchange>>[0]);
}

$effect(() => {
  const input = host?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  ref = input;
  if (input) {
    input.accept = accept;
    input.tabIndex = hidden ? -1 : tabindex;
  }
  return () => {
    if (ref === input) ref = null;
  };
});
</script>

<div bind:this={host} class={hidden ? 'hidden' : undefined}>
  <FileUpload
    multiple={false}
    showPreviews={false}
    labels={{ label, inputLabel: label, browse: label, description: '' }}
    class={className}
    data-devtools-file-input=""
    onchange={forwardChange}
  />
</div>
