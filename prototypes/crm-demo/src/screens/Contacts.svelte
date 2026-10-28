<script lang="ts">
import { Pencil, Trash2 } from '@lucide/svelte';
import { avatarImage, can, Link, liveQuery, runService } from '@protoyard/renderer-svelte';
import { AlertDialog, Avatar, Button, DataTable, type DataTableColumn } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import ContactDialog from '../components/ContactDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import type { Contact } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useCrm } from '../lib/context.ts';

type Row = Contact & { name: string; companyName: string };

const { db, services } = useCrm();
const rows = liveQuery(
  async (): Promise<Row[]> => {
    const [contacts, companies] = await Promise.all([
      db.contacts.toArray(),
      db.companies.toArray(),
    ]);
    const names = new Map(companies.map((c) => [c.id, c.name]));
    return contacts.map((c) => ({
      ...c,
      name: `${c.firstName} ${c.lastName}`,
      companyName: names.get(c.companyId) ?? '—',
    }));
  },
  { initial: [] }
);

let createOpen = $state(false);
let editing = $state<Contact | null>(null);
let editOpen = $state(false);
let removing = $state<Row | null>(null);
let removeOpen = $state(false);

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: nameCell },
  { key: 'companyName', header: 'Company', sortable: true, cell: companyCell },
  { key: 'email', header: 'Email', sortable: true, hideBelow: 'md' },
  { key: 'phone', header: 'Phone', hideBelow: 'lg' },
  { key: 'actions', header: 'Actions', align: 'right', cell: actionsCell },
];
</script>

{#snippet nameCell(c: Row)}
  <span class="flex items-center gap-3">
    <Avatar name={c.name} {...avatarImage(c.avatar)} size="sm" decorative />
    <span><span class="block font-medium">{c.name}</span><span class="block text-xs text-muted-foreground">{c.title}</span></span>
  </span>
{/snippet}
{#snippet companyCell(c: Row)}
  <Link href={`/companies/${c.companyId}`} class="hover:text-primary hover:underline">{c.companyName}</Link>
{/snippet}
{#snippet actionsCell(c: Row)}
  <span class="flex justify-end gap-1">
    {#if can(CAPABILITIES.contactsWrite)}
      <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onclick={() => { editing = c; editOpen = true; }}><LucideIcon icon={Pencil} class="size-4" /></Button>
    {/if}
    {#if can(CAPABILITIES.contactsDelete)}
      <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onclick={() => { removing = c; removeOpen = true; }}><LucideIcon icon={Trash2} class="size-4" /></Button>
    {/if}
  </span>
{/snippet}

<PageHeader title="Contacts" description={`${(rows.current ?? []).length} people across your accounts`}>
  {#snippet actions()}
    {#if can(CAPABILITIES.contactsWrite)}
      <Button onclick={() => (createOpen = true)} disabled={services.isPaywalled()}><Icon icon="plus" class="size-4" /> New contact</Button>
    {/if}
  {/snippet}
</PageHeader>

<DataTable
  {columns}
  rows={rows.current ?? []}
  getRowId={(c) => c.id}
  searchKeys={['name', 'email', 'companyName', 'title']}
  searchPlaceholder="Search people…"
  pageSize={20}
  loading={rows.loading}
  emptyTitle="No contacts yet"
  emptyDescription="Add people to the companies you work with."
  sort={{ key: 'name', direction: 'asc' }}
  caption="Contacts"
/>

<ContactDialog bind:open={createOpen} />
<ContactDialog bind:open={editOpen} contact={editing} />
<AlertDialog
  bind:open={removeOpen}
  title={`Delete ${removing?.name ?? 'contact'}?`}
  description="Deals that list this person keep existing without a primary contact."
  confirmLabel="Delete contact"
  destructive
  onConfirm={async () => {
    if (!removing) return;
    const target = removing;
    const result = await runService(() => services.contacts.remove(target.id), { success: 'Contact deleted' });
    if (!result.ok) throw result.error;
  }}
/>
