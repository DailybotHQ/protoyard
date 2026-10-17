<script lang="ts">
import { Plus, Settings, Trash2 } from '@lucide/svelte';
import { Button, type ButtonSize, type ButtonVariant, toast } from '@protoyard/ui';
import { wait } from './nav.ts';

const variants: ButtonVariant[] = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
];
const sizes: ButtonSize[] = ['sm', 'md', 'lg'];

let clicks = $state(0);
let lastVariant = $state<string | null>(null);
let saving = $state(false);
let disabled = $state(true);

async function save(): Promise<void> {
  saving = true;
  await wait(1200);
  saving = false;
  toast.success('Changes saved', { description: 'The loading state cleared itself.' });
}
</script>

<div class="grid gap-6">
  <section class="grid gap-2">
    <p class="text-xs text-muted-foreground">Variants</p>
    <div class="flex flex-wrap items-center gap-3">
      {#each variants as variant (variant)}
        <Button
          {variant}
          onclick={() => {
            clicks += 1;
            lastVariant = variant;
          }}
        >
          {variant[0]?.toUpperCase()}{variant.slice(1)}
        </Button>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground" aria-live="polite">
      {clicks === 0 ? 'Click any variant.' : `${clicks} click${clicks === 1 ? '' : 's'}, last: ${lastVariant}.`}
    </p>
  </section>

  <section class="grid gap-2">
    <p class="text-xs text-muted-foreground">Sizes (sm, md, lg, icon)</p>
    <div class="flex flex-wrap items-center gap-3">
      {#each sizes as size (size)}
        <Button {size} variant="outline" onclick={() => toast.info(`Size ${size}`)}>
          <Plus aria-hidden="true" /> Size {size}
        </Button>
      {/each}
      <Button size="icon" variant="ghost" aria-label="Settings" onclick={() => toast.info('Settings')}>
        <Settings aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="destructive"
        aria-label="Delete"
        onclick={() => toast.warning('Delete pressed', { description: 'Nothing was deleted.' })}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  </section>

  <section class="grid gap-2">
    <p class="text-xs text-muted-foreground">States</p>
    <div class="flex flex-wrap items-center gap-3">
      <Button loading={saving} loadingLabel="Saving changes" onclick={save}>
        {saving ? 'Saving…' : 'Save (loading)'}
      </Button>
      <Button variant="secondary" {disabled}>Disabled</Button>
      <Button variant="outline" onclick={() => (disabled = !disabled)}>
        {disabled ? 'Enable' : 'Disable'} the previous button
      </Button>
      <Button href="#/c/badge" variant="link">Link to Badge</Button>
    </div>
  </section>
</div>
