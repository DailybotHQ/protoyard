<script lang="ts">
import { Accordion, Checkbox, RadioGroup, Switch, Tabs } from '../../src/index.ts';

interface Props {
  /** Receives each bound ref once the harness mounts. */
  onrefs?: (refs: Record<string, Element | null>) => void;
}

let { onrefs }: Props = $props();

let checkboxRef = $state<HTMLButtonElement | null>(null);
let switchRef = $state<HTMLButtonElement | null>(null);
let tabsRef = $state<HTMLDivElement | null>(null);
let tab = $state<string | undefined>();
let open = $state<string | string[] | undefined>('');

$effect(() => {
  onrefs?.({ checkbox: checkboxRef, switch: switchRef, tabs: tabsRef });
});
</script>

<Checkbox bind:ref={checkboxRef} label="Remember me" />
<Switch bind:ref={switchRef} label="Alerts" />
<RadioGroup
  aria-label="Plan"
  items={[
    { value: 'free', label: 'Free' },
    { value: 'team', label: 'Team' },
  ]}
/>
<Tabs
  bind:ref={tabsRef}
  bind:value={tab}
  label="Sections"
  items={[
    { value: 'overview', label: 'Overview' },
    { value: 'activity', label: 'Activity' },
    { value: 'settings', label: 'Settings' },
  ]}
>
  {#snippet content(item)}<p>{item.label} panel</p>{/snippet}
</Tabs>
<p data-testid="tab">{tab}</p>
<Accordion
  bind:value={open}
  items={[
    { value: 'billing', title: 'Billing', content: 'Invoices go out monthly.' },
    { value: 'security', title: 'Security', content: 'Sessions expire after a day.' },
  ]}
/>
<p data-testid="open">{String(open)}</p>
