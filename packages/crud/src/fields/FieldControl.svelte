<script lang="ts">
import type { BlueprintField } from '@protoyard/blueprint';
import { fieldLabel, parseMoneyText } from '@protoyard/blueprint';
import { Input, Select, Textarea } from '@protoyard/ui';

/**
 * One control for a blueprint field. Binds a string/number/boolean/array value
 * suitable for entity service inputs (money as cents number or major-unit text).
 */
let {
  field,
  value = $bindable<unknown>(),
  error,
  disabled = false,
  id,
}: {
  field: BlueprintField;
  value?: unknown;
  error?: string;
  disabled?: boolean;
  id?: string;
} = $props();

const label = $derived(fieldLabel(field));

/** Display money as major units in the text box. */
const moneyText = $derived.by(() => {
  if (field.kind !== 'money') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return (value / 100).toFixed(2);
  if (typeof value === 'string') return value;
  return '';
});

function setMoney(text: string) {
  const cents = parseMoneyText(text);
  value = cents === null ? text : cents;
}

function setTags(text: string) {
  value = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const tagsText = $derived(
  field.kind === 'tags' && Array.isArray(value)
    ? value.join(', ')
    : typeof value === 'string'
      ? value
      : ''
);

const enumItems = $derived(
  field.kind === 'enum'
    ? field.values.map((v) => ({ value: v, label: field.labels?.[v] ?? v }))
    : []
);
</script>

{#if field.kind === 'boolean'}
  <label class="inline-flex items-center gap-2 text-sm">
    <input
      {id}
      type="checkbox"
      class="size-4 rounded border-input"
      checked={Boolean(value)}
      {disabled}
      aria-invalid={error ? 'true' : undefined}
      onchange={(e) => (value = (e.currentTarget as HTMLInputElement).checked)}
    />
    <span class="text-muted-foreground">{label}</span>
  </label>
{:else if field.kind === 'longText' || field.kind === 'json'}
  <Textarea
    {id}
    value={typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)}
    {disabled}
    rows={field.kind === 'json' ? 6 : 4}
    aria-invalid={error ? 'true' : undefined}
    oninput={(e) => {
      const text = (e.currentTarget as HTMLTextAreaElement).value;
      if (field.kind === 'json') {
        try {
          value = text.trim() === '' ? null : JSON.parse(text);
        } catch {
          value = text;
        }
      } else value = text;
    }}
  />
{:else if field.kind === 'enum'}
  <Select
    {id}
    items={enumItems}
    value={value == null ? '' : String(value)}
    {disabled}
    placeholder={`Select ${label.toLowerCase()}`}
    onValueChange={(next) => (value = next || null)}
  />
{:else if field.kind === 'money'}
  <Input
    {id}
    type="text"
    inputmode="decimal"
    value={moneyText}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    oninput={(e) => setMoney((e.currentTarget as HTMLInputElement).value)}
    placeholder="0.00"
  />
{:else if field.kind === 'integer' || field.kind === 'number'}
  <Input
    {id}
    type="number"
    step={field.kind === 'integer' ? '1' : 'any'}
    value={value == null ? '' : String(value)}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    oninput={(e) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      if (raw.trim() === '') value = null;
      else value = field.kind === 'integer' ? Number.parseInt(raw, 10) : Number(raw);
    }}
  />
{:else if field.kind === 'tags'}
  <Input
    {id}
    type="text"
    value={tagsText}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    oninput={(e) => setTags((e.currentTarget as HTMLInputElement).value)}
    placeholder="comma, separated, tags"
  />
{:else if field.kind === 'date' || field.kind === 'datetime'}
  <Input
    {id}
    type={field.kind === 'date' ? 'date' : 'datetime-local'}
    value={typeof value === 'string' ? value.slice(0, field.kind === 'date' ? 10 : 16) : ''}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    oninput={(e) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      value = raw.trim() === '' ? null : raw;
    }}
  />
{:else}
  <Input
    {id}
    type={field.kind === 'email' ? 'email' : field.kind === 'url' ? 'url' : 'text'}
    value={value == null ? '' : Array.isArray(value) ? value.join(',') : String(value)}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    oninput={(e) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      if (field.kind === 'relation' && 'cardinality' in field && field.cardinality === 'many') {
        value = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        value = raw.trim() === '' ? null : raw.trim();
      }
    }}
    placeholder={field.kind === 'relation' || field.kind === 'persona' ? 'id' : undefined}
  />
{/if}
