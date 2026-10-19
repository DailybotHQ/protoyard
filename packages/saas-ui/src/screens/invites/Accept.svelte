<script lang="ts">
import { navigate, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { createInvitationServices, type InvitationPreview } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  LoadingState,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { applyServiceError, authServices, hashParam } from '../auth/helpers.ts';

/**
 * Accept a workspace invitation from the simulated inbox
 * (`#/invites/accept?token=…`, also `#/invite?token=…`). Open to guests and
 * signed-in people alike: accepting signs the invitee in (simulated: opening
 * the link stands for owning the mailbox) unless their account requires MFA.
 */
const { runtime, config } = authServices();
const invites = createInvitationServices(runtime);
const principal = usePrincipal(runtime);

let tokenId = $state('');
let preview = $state<InvitationPreview | null>(null);
let name = $state('');
let password = $state('');
let busy = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');
let mfaHandoff = $state(false);

const signedInAs = $derived(principal.current?.persona ?? null);
const someoneElse = $derived(
  Boolean(signedInAs && preview?.email && signedInAs.email?.toLowerCase() !== preview.email)
);
const workspace = $derived(preview?.organizationName ?? 'the workspace');

onMount(async () => {
  tokenId = hashParam('token');
  preview = await invites.preview(tokenId);
});

async function accept() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() =>
    invites.accept({
      tokenId,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(password ? { password } : {}),
    })
  );
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    // The link may have expired or been used meanwhile: show its real state.
    preview = await invites.preview(tokenId);
    return;
  }
  if (result.value.requiresMfa) {
    mfaHandoff = true;
    return;
  }
  navigate(config.homePath);
}

const ERRORS: Record<
  Exclude<InvitationPreview['status'], 'valid'>,
  { title: string; body: string }
> = {
  unknown: {
    title: "This invitation link isn't valid",
    body: 'Check that you opened the whole link from your simulated inbox, or ask for a new invitation.',
  },
  expired: {
    title: 'This invitation has expired',
    body: 'Invitations expire on the prototype clock. Ask the person who invited you to send a new one.',
  },
  used: {
    title: 'This invitation was already used',
    body: 'Sign in with the invited email to open the workspace.',
  },
  revoked: {
    title: 'This invitation was withdrawn',
    body: 'It was revoked or replaced by a newer link. Use the most recent invitation in your inbox.',
  },
};
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="invite-accept">
  {#if !preview}
    <LoadingState label="Checking your invitation" class="py-16" />
  {:else if mfaHandoff}
    <Card>
      <CardHeader>
        <CardTitle>You joined {workspace}</CardTitle>
        <CardDescription>Your account uses a simulated authenticator.</CardDescription>
      </CardHeader>
      <CardContent>
        <p role="status" class="text-sm">Sign in with {preview.email} and your code to open the workspace.</p>
      </CardContent>
      <CardFooter><Button href={`#${config.signInPath}`}>Sign in</Button></CardFooter>
    </Card>
  {:else if preview.status !== 'valid'}
    {@const error = ERRORS[preview.status]}
    <Card>
      <CardHeader>
        <CardTitle>{error.title}</CardTitle>
        <CardDescription>{preview.email ? `Invitation for ${preview.email}` : 'Workspace invitation'}</CardDescription>
      </CardHeader>
      <CardContent><p role="alert" class="text-sm">{error.body}</p></CardContent>
      <CardFooter class="flex gap-2">
        <Button href={`#${config.signInPath}`} variant="outline">Go to sign in</Button>
        <Button href={`#${config.inboxPath}`} variant="ghost">Open inbox</Button>
      </CardFooter>
    </Card>
  {:else}
    <Card>
      <CardHeader>
        <CardTitle>Join {workspace}</CardTitle>
        <CardDescription>
          {preview.inviterName ?? 'A teammate'} invited {preview.email} to join as <strong>{preview.role}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
        {#if someoneElse}
          <p role="status" class="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
            You're signed in as {signedInAs?.name}. Accepting continues as {preview.email}.
          </p>
        {/if}
        {#if !preview.hasAccount}
          <FormField label="Your name" error={issues.name ?? null} description="Defaults to the name in your email address.">
            {#snippet children(control)}
              <Input {...control.props} bind:value={name} autocomplete="name" />
            {/snippet}
          </FormField>
          <FormField
            label="Password (optional)"
            error={issues.password ?? null}
            description="Simulation only — do not use a real password. What you type is kept as plain text in this browser and in exported snapshots."
          >
            {#snippet children(control)}
              <Input {...control.props} type="password" bind:value={password} autocomplete="off" />
            {/snippet}
          </FormField>
        {:else}
          <p class="text-sm text-muted-foreground">You already have an account with this email. Accepting adds you to the workspace.</p>
        {/if}
        <Button onclick={() => void accept()} loading={busy} loadingLabel="Joining workspace" disabled={busy}>
          Accept and join
        </Button>
      </CardContent>
      <CardFooter><p class="text-xs text-muted-foreground">Simulated invitation: nothing was emailed and no real account exists.</p></CardFooter>
    </Card>
  {/if}
</main>
