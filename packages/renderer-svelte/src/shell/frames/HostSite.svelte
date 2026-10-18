<script lang="ts">
/**
 * Deterministic fictional customer landing page for the widget-host shell.
 * Neutral palette via `data-theme="light"` + explicit colors so the prototype
 * theme (and dark mode) never repaints the host site.
 */
let {
  hostName = 'Northwind Outfitters (fictional)',
}: {
  hostName?: string;
} = $props();

const brand = $derived(hostName.replace(/\s*\(fictional\)\s*$/i, '').trim() || hostName);
</script>

<!--
  Styles are self-contained (no --py-* tokens) so the host stays readable
  regardless of the app's appearance override.
-->
<div
  data-py-host-site
  data-theme="light"
  class="box-border flex h-full w-full flex-col overflow-auto"
  style="color-scheme: light; background: #f1f5f9; color: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif;"
>
  <header
    class="flex shrink-0 items-center justify-between gap-4 px-8 py-4"
    style="background: #ffffff; border-bottom: 1px solid #e2e8f0;"
  >
    <div class="flex items-center gap-3">
      <span
        class="grid size-9 place-items-center rounded-lg text-sm font-bold tracking-tight"
        style="background: #0f766e; color: #ecfdf5;"
        aria-hidden="true"
      >
        {brand.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <p class="text-sm font-semibold tracking-tight" style="color: #0f172a;">{hostName}</p>
        <p class="text-xs" style="color: #475569;">example.com · simulated storefront</p>
      </div>
    </div>
    <nav class="hidden items-center gap-5 text-sm font-medium sm:flex" style="color: #334155;" aria-label="Host site">
      <span>Shop</span>
      <span>Guides</span>
      <span>About</span>
      <span class="rounded-full px-3 py-1 text-xs font-semibold" style="background: #ccfbf1; color: #115e59;">
        Free shipping (demo)
      </span>
    </nav>
  </header>

  <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-8 py-10">
    <section class="flex flex-col gap-3">
      <p class="text-xs font-semibold tracking-wide uppercase" style="color: #0f766e;">Spring trail collection</p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl" style="color: #0f172a;">
        Gear for the long way around
      </h1>
      <p class="max-w-xl text-base leading-relaxed" style="color: #475569;">
        {brand} is a fictional outdoor retailer used only inside Protoyard demos. Nothing here is for
        sale, and no real customer data is shown. Open the chat bubble if you need a hand picking a
        pack size.
      </p>
      <div class="flex flex-wrap gap-3 pt-2">
        <span
          class="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
          style="background: #0f766e; color: #ecfdf5;"
        >
          Browse packs
        </span>
        <span
          class="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
          style="background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1;"
        >
          Size guide
        </span>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-3" aria-label="Featured products">
      {#each [
        { title: 'Cascade 40L', detail: 'Weekend pack · $189 (demo)' },
        { title: 'Ridge Shell', detail: 'Waterproof layer · $149 (demo)' },
        { title: 'Trail Mug', detail: 'Double-wall steel · $28 (demo)' },
      ] as item (item.title)}
        <article
          class="flex flex-col gap-2 rounded-xl p-4"
          style="background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgb(15 23 42 / 0.04);"
        >
          <div class="h-24 rounded-lg" style="background: linear-gradient(135deg, #ccfbf1, #e2e8f0);" aria-hidden="true"
          ></div>
          <h2 class="text-sm font-semibold" style="color: #0f172a;">{item.title}</h2>
          <p class="text-xs" style="color: #475569;">{item.detail}</p>
        </article>
      {/each}
    </section>

    <section
      class="rounded-xl p-5 text-sm leading-relaxed"
      style="background: #ecfeff; border: 1px solid #a5f3fc; color: #155e75;"
    >
      <p class="font-semibold">Simulated customer site</p>
      <p class="mt-1">
        This page is decoration for reviewing chat and support widgets in context. Links do not
        navigate; the launcher opens the prototype panel.
      </p>
    </section>
  </main>

  <footer class="shrink-0 px-8 py-4 text-xs" style="color: #475569; border-top: 1px solid #e2e8f0;">
    © {brand} · fictional brand · Protoyard widget-host shell
  </footer>
</div>
