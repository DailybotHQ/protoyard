<script lang="ts">
/** Fictional code-editor host mock — sample tree and buffer, no real IDE brands. */
const files = ['src/main.ts', 'src/ui/Panel.svelte', 'README.md'];
const sample = [
  'let open = $state(true);',
  '',
  '// Fictional plugin source for the side panel.',
  'function toggle() {',
  '  open = !open;',
  '}',
].join('\n');
</script>

<div
  data-py-side-host="code-editor"
  data-theme="light"
  class="box-border flex h-full w-full min-w-0"
  style="color-scheme: light; background: #0b1220; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;"
>
  <aside
    class="flex w-44 shrink-0 flex-col gap-1 border-r px-2 py-3 text-xs"
    style="border-color: #1e293b; background: #020617;"
    aria-label="File tree"
  >
    <p class="px-2 pb-2 text-[10px] font-semibold tracking-wide uppercase" style="color: #94a3b8;">
      Harbor IDE (fictional)
    </p>
    {#each files as file (file)}
      <span
        class="truncate rounded px-2 py-1"
        style={file.endsWith('Panel.svelte')
          ? 'background: #1e293b; color: #f8fafc;'
          : 'color: #94a3b8;'}
      >
        {file}
      </span>
    {/each}
  </aside>
  <section class="flex min-w-0 flex-1 flex-col text-xs" aria-label="Editor">
    <header
      class="flex h-9 shrink-0 items-center gap-2 border-b px-3"
      style="border-color: #1e293b; background: #0f172a;"
    >
      <span style="color: #e2e8f0;">Panel.svelte</span>
      <span style="color: #475569;">· unsaved (demo)</span>
    </header>
    <pre class="m-0 flex-1 overflow-auto p-4 leading-5" style="color: #cbd5e1;"><code>{sample}</code></pre>
  </section>
</div>
