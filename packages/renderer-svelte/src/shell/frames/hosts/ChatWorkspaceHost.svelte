<script lang="ts">
/** Fictional team-chat workspace mock — no real product brands or logos. */
const channels = ['# general', '# design-review', '# ship-it', '# random'];
const people = ['Ada Example', 'Bea Demo', 'Cy Fiction'];
</script>

<div
  data-py-side-host="chat-workspace"
  data-theme="light"
  class="box-border flex h-full w-full min-w-0"
  style="color-scheme: light; background: #f8fafc; color: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif;"
>
  <aside
    class="flex w-52 shrink-0 flex-col gap-3 border-r px-3 py-3 text-sm"
    style="background: #0f172a; color: #e2e8f0; border-color: #1e293b;"
    aria-label="Workspace navigation"
  >
    <p class="px-2 text-xs font-semibold tracking-wide uppercase" style="color: #94a3b8;">
      Atlas Team (fictional)
    </p>
    <div>
      <p class="mb-1 px-2 text-[11px] font-semibold uppercase" style="color: #94a3b8;">Channels</p>
      <ul class="flex flex-col gap-0.5">
        {#each channels as channel (channel)}
          <li>
            <span
              class="block rounded-md px-2 py-1.5"
              style={channel === '# general' ? 'background: #1e293b; color: #f8fafc;' : ''}
            >
              {channel}
            </span>
          </li>
        {/each}
      </ul>
    </div>
    <div>
      <p class="mb-1 px-2 text-[11px] font-semibold uppercase" style="color: #94a3b8;">People</p>
      <ul class="flex flex-col gap-0.5">
        {#each people as person (person)}
          <li class="truncate px-2 py-1" style="color: #cbd5e1;">{person}</li>
        {/each}
      </ul>
    </div>
  </aside>
  <section class="flex min-w-0 flex-1 flex-col" aria-label="Channel">
    <header
      class="flex h-12 shrink-0 items-center border-b px-4 text-sm font-semibold"
      style="border-color: #e2e8f0; background: #ffffff;"
    >
      # general
    </header>
    <div class="flex flex-1 flex-col gap-3 overflow-auto px-4 py-4 text-sm">
      <p style="color: #475569;">Yesterday</p>
      <div class="rounded-lg px-3 py-2" style="background: #ffffff; border: 1px solid #e2e8f0;">
        <p class="text-xs font-semibold">Ada Example</p>
        <p style="color: #334155;">Mock thread: the plugin panel on the right is the prototype under review.</p>
      </div>
      <div class="rounded-lg px-3 py-2" style="background: #ffffff; border: 1px solid #e2e8f0;">
        <p class="text-xs font-semibold">Bea Demo</p>
        <p style="color: #334155;">All names and copy here are fictional — no real chat product.</p>
      </div>
    </div>
    <div
      class="shrink-0 border-t px-4 py-3 text-sm"
      style="border-color: #e2e8f0; background: #ffffff; color: #475569;"
    >
      Message #general (decorative)
    </div>
  </section>
</div>
