<script lang="ts">
import { SaveBar, SettingsLayout, SettingsSection, SwitchRow } from '@protoyard/views-ui/settings';

const sections = [
  { id: 'general', label: 'General', description: 'Workspace preferences' },
  { id: 'alerts', label: 'Alerts', description: 'Notification preferences' },
];
let active = $state('general');
let enabled = $state(true);
let savedEnabled = $state(true);
const dirty = $derived(enabled !== savedEnabled);
async function save() {
  await Promise.resolve();
  savedEnabled = enabled;
}
</script>
<SettingsLayout bind:active {sections} title="Workspace settings" description="Preferences are kept in this demo session.">
  {#snippet children(section)}
    <SettingsSection title={section === 'alerts' ? 'Alerts' : 'General'} description="Change a preference and navigate between sections.">
      <SwitchRow label="Weekly summary" description="Send a Monday recap." bind:checked={enabled} />
      <div class="mt-4 text-sm text-muted-foreground">Weekly summary is {enabled ? 'on' : 'off'}.</div>
      <SaveBar {dirty} onSave={save} onDiscard={() => (enabled = savedEnabled)} />
    </SettingsSection>
  {/snippet}
</SettingsLayout>
