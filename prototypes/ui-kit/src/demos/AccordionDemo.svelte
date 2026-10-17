<script lang="ts">
import { Accordion, type AccordionItem, Button } from '@protoyard/ui';

const faq: AccordionItem[] = [
  {
    value: 'trial',
    title: 'How long is the free trial?',
    content: 'Fourteen days, no card required. You keep your data if you upgrade.',
  },
  {
    value: 'seats',
    title: 'Can I change the number of seats later?',
    content: 'Yes. Seat changes are prorated on the next invoice.',
  },
  {
    value: 'export',
    title: 'Can I export my data?',
    content: 'Any time, as CSV or JSON, from Settings → Data.',
  },
  { value: 'sla', title: 'Is there an SLA? (Enterprise only)', disabled: true },
];

const sections: AccordionItem[] = [
  { value: 'profile', title: 'Profile' },
  { value: 'security', title: 'Security' },
  { value: 'notifications', title: 'Notifications' },
];

let single = $state<string | string[] | undefined>('trial');
let multiple = $state<string | string[] | undefined>(['profile']);
const openSections = $derived(Array.isArray(multiple) ? multiple : multiple ? [multiple] : []);
</script>

<div class="grid gap-8 md:grid-cols-2">
  <div class="grid content-start gap-2">
    <p class="text-xs text-muted-foreground">Single (one open at a time)</p>
    <Accordion items={faq} bind:value={single} />
  </div>
  <div class="grid content-start gap-2">
    <p class="text-xs text-muted-foreground">Multiple with rich content</p>
    <Accordion type="multiple" items={sections} bind:value={multiple}>
      {#snippet content(item)}
        <p>Settings for <strong class="text-foreground">{item.title.toLowerCase()}</strong> go here.</p>
      {/snippet}
    </Accordion>
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onclick={() => (multiple = sections.map((s) => s.value))}>
        Expand all
      </Button>
      <Button size="sm" variant="ghost" onclick={() => (multiple = [])}>Collapse all</Button>
      <span class="text-xs text-muted-foreground" aria-live="polite">
        Open: {openSections.length ? openSections.join(', ') : 'none'}
      </span>
    </div>
  </div>
</div>
