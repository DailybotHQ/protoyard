<script lang="ts">
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  FormField,
  Input,
  RadioGroup,
  type RadioOption,
  Select,
  type SelectOption,
  Switch,
  Textarea,
  toast,
} from '@protoyard/ui';

interface WorkspaceForm {
  name: string;
  slug: string;
  ownerEmail: string;
  description: string;
  industry: string;
  timezone: string;
  visibility: string;
  inviteTeam: boolean;
  acceptTerms: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const industries: SelectOption[] = [
  { value: 'software', label: 'Software' },
  { value: 'education', label: 'Education' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'retail', label: 'Retail' },
  { value: 'nonprofit', label: 'Nonprofit' },
];
const timezones: SelectOption[] = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Bogota',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Africa/Lagos',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
].map((zone) => ({ value: zone, label: zone.replace('_', ' ') }));
const visibilities: RadioOption[] = [
  { value: 'private', label: 'Private', description: 'Only invited members can join.' },
  { value: 'domain', label: 'Company domain', description: 'Anyone with your email domain.' },
  {
    value: 'public',
    label: 'Public',
    description: 'Not available on the free plan.',
    disabled: true,
  },
];

function emptyForm(): WorkspaceForm {
  return {
    name: '',
    slug: '',
    ownerEmail: '',
    description: '',
    industry: '',
    timezone: '',
    visibility: 'private',
    inviteTeam: true,
    acceptTerms: false,
  };
}

let form = $state<WorkspaceForm>(emptyForm());
let submitAttempted = $state(false);
let saving = $state(false);
let submitted = $state<WorkspaceForm | null>(null);

function validate(values: WorkspaceForm): Partial<Record<keyof WorkspaceForm, string>> {
  const errors: Partial<Record<keyof WorkspaceForm, string>> = {};
  if (!values.name.trim()) errors.name = 'Workspace name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Use at least 3 characters.';
  if (!values.slug) errors.slug = 'URL slug is required.';
  else if (!SLUG.test(values.slug))
    errors.slug = 'Lowercase letters, numbers and single dashes only.';
  if (!values.ownerEmail.trim()) errors.ownerEmail = 'Owner email is required.';
  else if (!EMAIL.test(values.ownerEmail.trim()))
    errors.ownerEmail = 'Enter a valid email, like you@example.com.';
  if (values.description.trim().length > 0 && values.description.trim().length < 20) {
    errors.description = 'Write at least 20 characters, or leave it empty.';
  }
  if (!values.industry) errors.industry = 'Choose an industry.';
  if (!values.timezone) errors.timezone = 'Choose a time zone.';
  if (!values.acceptTerms) errors.acceptTerms = 'You must accept the terms to continue.';
  return errors;
}

// Errors appear after the first submit and then track the values, so fixing a field clears it.
const errors = $derived(submitAttempted ? validate(form) : {});
const errorCount = $derived(Object.keys(errors).length);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let slugEdited = $state(false);

function onNameInput(): void {
  if (!slugEdited) form.slug = slugify(form.name);
}

function focusFirstError(): void {
  const first = document.querySelector<HTMLElement>('#forms-page-form [aria-invalid="true"]');
  first?.focus();
}

async function submit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (saving) return;
  submitAttempted = true;
  if (Object.keys(validate(form)).length > 0) {
    queueMicrotask(focusFirstError);
    return;
  }
  saving = true;
  await new Promise((resolve) => setTimeout(resolve, 800));
  saving = false;
  submitted = { ...form, name: form.name.trim(), ownerEmail: form.ownerEmail.trim() };
  toast.success('Workspace created', { description: `${submitted.name} is ready.` });
}

function reset(): void {
  form = emptyForm();
  submitAttempted = false;
  slugEdited = false;
  submitted = null;
}

const labelFor = (items: SelectOption[], value: string): string =>
  items.find((item) => item.value === value)?.label ?? value;
</script>

<div class="grid max-w-3xl gap-6">
  <header class="grid gap-2">
    <h1 class="font-heading text-2xl font-semibold tracking-tight">Forms</h1>
    <p class="text-muted-foreground">
      A realistic “Create workspace” form built from FormField, Input, Textarea, Select, Combobox,
      RadioGroup, Checkbox and Switch. Submit it empty to see inline errors; they clear as you fix
      each field. Saving is simulated and nothing leaves your browser.
    </p>
  </header>

  <Card>
    <CardHeader>
      <CardTitle level={2}>Create workspace</CardTitle>
      <CardDescription>Fields marked with * are required.</CardDescription>
    </CardHeader>
    <form id="forms-page-form" novalidate onsubmit={submit} aria-busy={saving || undefined}>
      <CardContent class="grid gap-5">
        {#if errorCount > 0}
          <p
            role="alert"
            class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
          >
            Please fix {errorCount} field{errorCount === 1 ? '' : 's'} before continuing.
          </p>
        {/if}

        <div class="grid gap-5 sm:grid-cols-2">
          <FormField label="Workspace name" required error={errors.name}>
            {#snippet children({ props })}
              <Input
                {...props}
                bind:value={form.name}
                oninput={onNameInput}
                autocomplete="organization"
                placeholder="Acme Research"
                disabled={saving}
              />
            {/snippet}
          </FormField>
          <FormField
            label="URL slug"
            required
            description={`protoyard.example.com/${form.slug || 'your-slug'}`}
            error={errors.slug}
          >
            {#snippet children({ props })}
              <Input
                {...props}
                bind:value={form.slug}
                oninput={() => (slugEdited = true)}
                autocomplete="off"
                spellcheck={false}
                disabled={saving}
              />
            {/snippet}
          </FormField>
        </div>

        <FormField
          label="Owner email"
          required
          description="We send the confirmation here."
          error={errors.ownerEmail}
        >
          {#snippet children({ props })}
            <Input
              {...props}
              type="email"
              bind:value={form.ownerEmail}
              autocomplete="email"
              placeholder="you@example.com"
              disabled={saving}
            />
          {/snippet}
        </FormField>

        <FormField
          label="Description"
          description="Optional. If provided, at least 20 characters."
          error={errors.description}
        >
          {#snippet children({ props })}
            <Textarea
              {...props}
              bind:value={form.description}
              maxlength={300}
              placeholder="What will this workspace be used for?"
              disabled={saving}
            />
          {/snippet}
        </FormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <FormField label="Industry" required error={errors.industry}>
            {#snippet children({ props })}
              <Select
                {...props}
                items={industries}
                bind:value={form.industry}
                placeholder="Choose an industry"
                disabled={saving}
              />
            {/snippet}
          </FormField>
          <FormField label="Time zone" required error={errors.timezone}>
            {#snippet children({ props })}
              <Combobox
                {...props}
                items={timezones}
                bind:value={form.timezone}
                placeholder="Search time zones…"
                disabled={saving}
              />
            {/snippet}
          </FormField>
        </div>

        <div class="grid gap-3">
          <p id="forms-page-visibility" class="text-sm font-medium">Visibility</p>
          <RadioGroup
            aria-labelledby="forms-page-visibility"
            items={visibilities}
            bind:value={form.visibility}
            disabled={saving}
          />
        </div>

        <Switch
          label="Invite my team after creating"
          description="We’ll open the invite dialog when the workspace is ready."
          bind:checked={form.inviteTeam}
          disabled={saving}
        />

        <div class="grid gap-1.5">
          <Checkbox
            label="I accept the terms of service"
            bind:checked={form.acceptTerms}
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-errormessage={errors.acceptTerms ? 'forms-page-terms-error' : undefined}
            disabled={saving}
          />
          {#if errors.acceptTerms}
            <p id="forms-page-terms-error" class="pl-6.5 text-xs font-medium text-destructive">
              {errors.acceptTerms}
            </p>
          {/if}
        </div>
      </CardContent>
      <CardFooter class="justify-end">
        <Button variant="ghost" onclick={reset} disabled={saving}>Reset</Button>
        <Button type="submit" loading={saving} loadingLabel="Creating workspace">
          {saving ? 'Creating…' : 'Create workspace'}
        </Button>
      </CardFooter>
    </form>
  </Card>

  {#if submitted}
    <Card aria-labelledby="forms-page-summary">
      <CardHeader>
        <div class="flex items-center justify-between gap-2">
          <CardTitle level={2} id="forms-page-summary">Submitted values</CardTitle>
          <Badge variant="success">Saved</Badge>
        </div>
        <CardDescription>This is what the form sent. Reset to start again.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt class="text-muted-foreground">Name</dt>
          <dd class="font-medium">{submitted.name}</dd>
          <dt class="text-muted-foreground">Slug</dt>
          <dd><code>{submitted.slug}</code></dd>
          <dt class="text-muted-foreground">Owner</dt>
          <dd>{submitted.ownerEmail}</dd>
          <dt class="text-muted-foreground">Description</dt>
          <dd>{submitted.description.trim() || '—'}</dd>
          <dt class="text-muted-foreground">Industry</dt>
          <dd>{labelFor(industries, submitted.industry)}</dd>
          <dt class="text-muted-foreground">Time zone</dt>
          <dd>{labelFor(timezones, submitted.timezone)}</dd>
          <dt class="text-muted-foreground">Visibility</dt>
          <dd>{labelFor(visibilities, submitted.visibility)}</dd>
          <dt class="text-muted-foreground">Invite team</dt>
          <dd>{submitted.inviteTeam ? 'Yes' : 'No'}</dd>
        </dl>
      </CardContent>
    </Card>
  {/if}
</div>
