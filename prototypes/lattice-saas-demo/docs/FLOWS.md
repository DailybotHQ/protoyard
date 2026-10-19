# Lattice: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. This prototype has no
`src/domain/services.ts`:

- **Project services** (this prototype's own domain):
  `createProjectServices(runtime)` in `src/domain/projects.ts`. Its three
  mutations (`create`, `update`, `remove`) are the first three flows. Each
  one first requires a signed-in principal with an active workspace (else a
  `ValidationError`: "Sign in to manage projects." / "Choose a workspace
  before managing projects."), then follows the full pipeline.
- **SaaS kit services** from `@protoyard/saas`, called by the kit screens
  of `@protoyard/saas-ui` that `saasRoutes` mounts: `createAuthServices`,
  `createMfaServices`, `createMagicLinkServices`,
  `createPasswordResetServices`, `createOAuthSimulator`,
  `createOnboarding`, `createWorkspaces`, `createInvitationServices`,
  `createInbox`, `createSettingsServices` and `createBilling` (configured
  in `src/App.svelte`), plus the runtime's `runtime.members`. The flows
  below name the method each screen calls; the kit's own behavior is
  documented in [packages/saas/README.md](../../../packages/saas/README.md).

Common failure behavior: the project screen and most kit screens call
services through `runService`. A permission denial shows a "Not allowed"
toast naming the capability, a simulated network failure (offline, timeout,
server error, rate limit) shows a toast with the simulated message, and a
zod `ValidationError` is shown inline next to the field (or as a form
message). Members, checkout, billing portal, workspace switcher and inbox
use their own `try`/`catch` and show the error text inline without a toast.
In every failure case nothing is written unless a step below says
otherwise.

## Create a project

1. Projects (`#/projects`) → "Create a project" panel → project name (at
   least 2 characters) and an optional outcome or summary → "Add project".
   The status line says "Project added to this workspace." The Overview's
   "New project" and "Create a project" buttons link here.
2. Service: `projects.create({ name, summary })` in src/domain/projects.ts
3. Capability: `projects:create` with `{ organizationId }` (owner, admin, member)
4. Writes (one transaction): `projects` (new row: id, organizationId = active workspace, ownerPersonaId = acting persona, name, summary, status `planning`, createdAt, updatedAt)
5. Failure states: signed out or no workspace, permission denied, validation errors ("Enter at least 2 characters", name over 80 or summary over 240 characters), simulated offline or failure (nothing written; the error text also appears in the status line)

## Change a project's status

1. Projects → the "Status" select on a project card → Planning, Active or
   Complete. The select is disabled without `projects:update`.
2. Service: `projects.update({ ...project, status })` in src/domain/projects.ts
3. Capability: `projects:update` with `{ organizationId }` (owner, admin, member; no record-level rule, so a member can change any project in the workspace)
4. Writes (one transaction): `projects` (name, summary, status, updatedAt; the screen resends the stored name and summary)
5. Failure states: "Project not found in this workspace.", permission denied, validation errors, simulated offline or failure (nothing written; the select keeps showing the stored status)

The service accepts a new name and summary too, but no screen edits them.

## Delete a project

1. Projects → the trash button on a project card (shown only with
   `projects:delete`). There is no confirmation. The status line says
   "Project removed from this workspace."
2. Service: `projects.remove(id)` in src/domain/projects.ts
3. Capability: `projects:delete` with `{ organizationId }` (owner and admin through `*`; no role names it)
4. Writes (one transaction): deletes the `projects` row
5. Failure states: "Project not found in this workspace.", permission denied, simulated offline or failure (nothing deleted)

## Sign up

1. Landing (`#/`) → "Create your workspace" or header "Start your
   workspace" → Create your account (`#/sign-up`) → name, an `example.com`
   email and a password → "Create account". The screen then says "Check
   your simulated inbox"; the person stays signed out.
2. Service: `auth.signUp({ name, email, password })` (`createAuthServices`, packages/saas/src/auth.ts)
3. Capability: none (signed-out flow). zod validates the input.
4. Writes (one identity transaction): `py_personas` (new persona, `onboardingComplete: false`), `py_organizations` ("<name>'s workspace"), `py_memberships` (role `owner`), `saas_accounts` (emailVerified `false`, simulatedPassword, status `active`), `saas_tokens` (`verify-email`, 24 h), `saas_inbox` (the confirmation message), `saas_sessions_log` (`sign-up`)
5. Failure states: "An account with this email already exists", validation errors (non-fictional email domain, short password), simulated offline or failure (nothing written)

Gap: the confirmation message sits in the simulated inbox, but the inbox is
only reachable when signed in (the header drawer and `#/inbox`), so a new
visitor cannot open it from the UI. One way through is to sign in as a
seeded account and open the new address in the inbox.

## Confirm an email address

1. Inbox → the "Confirm email" action (`#/auth/verify?token=…`) → "Confirm".
2. Service: `auth.verifyEmail(tokenId)` (packages/saas/src/auth.ts)
3. Capability: none (the token stands for owning the mailbox)
4. Writes (one transaction): `saas_tokens` (consumedAt), `saas_accounts` (emailVerified `true`)
5. Failure states: "This confirmation link is not valid.", "… was already used.", "… has expired. Ask for a new one.", simulated offline or failure

## Sign in with a password

1. Header "Sign in" or landing "Explore a demo account" → Sign in
   (`#/sign-in`) → email and password (seeded accounts use `demo-password`;
   the scenario actor is `owner@example.com`) → "Sign in". Success goes to
   `?next=` or `#/app`, which sends a person with unfinished onboarding to
   `#/onboarding`; an account with active MFA goes to `#/auth/mfa`.
2. Service: `mfa.signInWithPassword({ email, password })` (`createMfaServices`, packages/saas/src/mfa.ts)
3. Capability: none (signed-out flow)
4. Writes (one transaction): `saas_sessions_log` (success or failure with a reason); on success `saas_accounts` (failedAttempts 0, lastSignInAt), then the simulated session signs in
5. Failure states: "No account uses this email", "Incorrect password.", "Confirm your email first. Check your simulated inbox.", locked or disabled account, simulated offline or failure (nothing written)

This path does not count failed attempts or lock accounts (the kit's
`auth.signIn` does, but no screen calls it).

## Complete an MFA challenge

1. After a password or magic-link sign-in on an account with active MFA →
   Multi-factor (`#/auth/mfa?account=…`). The screen shows the simulated
   authenticator code; type it (or switch to a recovery code) → submit.
2. Service: `mfa.completeChallenge(accountId, { code } | { recoveryCode })` (packages/saas/src/mfa.ts)
3. Capability: none (signed-out flow)
4. Writes (one transaction): `saas_accounts` (lastSignInAt), `saas_mfa` (the recovery code's usedAt when one is used), `saas_sessions_log`; then the session signs in
5. Failure states: wrong or used code, "This account does not have an active simulated MFA challenge.", simulated offline or failure

## Sign in with a magic link

1. Sign in → "Use a magic link" (`#/auth/magic`) → email → "Send sign-in
   link". Then the inbox → the message's action (`#/auth/magic?token=…`),
   which signs in automatically.
2. Service: `magic.issue({ email })`, then `magic.consume(tokenId)` (`createMagicLinkServices`, packages/saas/src/magic-link.ts)
3. Capability: none
4. Writes: issue (one transaction) `saas_tokens` (`magic-link`) and `saas_inbox`; an unknown email writes nothing and the screen looks the same. Consume (one transaction) `saas_tokens` (consumedAt), `saas_accounts` (lastSignInAt), `saas_sessions_log`; MFA accounts are sent to the challenge instead
5. Failure states: "This sign-in link is not valid." / "… was already used." / expired, "This account is not available.", simulated offline or failure

The same inbox gap as sign-up applies to a signed-out visitor.

## Reset a password

1. Reset password (`#/auth/reset`) → email → "Send reset link"; then the
   inbox action (`#/auth/reset?token=…`) → new password twice → "Save new
   password". Gap: the "Forgot password?" button on Sign in links to
   `/auth/reset` without `#`, which leaves the hash route (see
   [SCREENS.md](SCREENS.md)).
2. Service: `reset.request({ email })`, then `reset.consume({ tokenId, password })` (`createPasswordResetServices`, packages/saas/src/reset.ts)
3. Capability: none
4. Writes: request (one transaction) `saas_tokens` (`password-reset`, 30 minutes) and `saas_inbox`; unknown or disabled accounts write nothing. Consume (one transaction) `saas_tokens` (consumedAt), `saas_accounts` (simulatedPassword, failedAttempts 0, status `active`)
5. Failure states: "Passwords do not match." (screen check), invalid, used or expired link, "This account is not available.", simulated offline or failure

## Approve or deny simulated provider consent

1. Reachable only by URL in this prototype: no Lattice screen mounts the
   kit's "Continue with …" buttons, so nothing starts a consent. A started
   consent opens `#/oauth/:provider/consent?state=…` → "Approve" or "Deny".
   `#/oauth/:provider/link` confirms linking a provider to the signed-in
   account and starts a `link` consent.
2. Service: `oauth.approve(state)` / `oauth.deny(state)`; `oauth.start(provider, 'link')` from the link screen (`createOAuthSimulator`, packages/saas/src/oauth.ts)
3. Capability: none (linking needs a signed-in session)
4. Writes (one transaction per step): `saas_tokens` (`oauth-state` consumed), `saas_sessions_log`; on approval `saas_accounts` (provider linked, or a new account with persona and workspace for an unknown identity), then the session signs in
5. Failure states: missing or expired state, consent denied, email not shared, provider error, simulated offline or failure

## Complete onboarding

1. After sign-in with unfinished onboarding (or `#/onboarding`): Profile
   (full name, job title) → Workspace (name; read-only without
   `workspaces:rename`) → Invite teammates (optional, up to 10
   `example.com` addresses) → Preferences (optional color mode) → Finish.
   Back, Skip and a confirmed Restart are persisted, so a reload resumes on
   the same step.
2. Service: `onboarding.submit(step, input)`, `onboarding.skip(step)`, `onboarding.goTo(step)`, `onboarding.complete()`, `onboarding.restart()` (`createOnboarding`, packages/saas/src/onboarding.ts). Before each `submit`, the screen applies the step's change: Profile writes the persona through `runtime.identity.write`, Workspace calls `workspaces.rename(id, { name })`, Invite calls `runtime.members.invite({ name, email, role: 'member' })` per new address, Preferences calls `runtime.theme.setPreference({ mode })`.
3. Capability: `onboarding:progress` for every wizard action (all four roles); the step changes need `workspaces:rename` (owner, admin, member) and `members:invite` (owner, admin, member; a viewer gets "Your role can't invite people. Skip this step instead."). The Profile change has no capability check.
4. Writes: `saas_onboarding` (currentStep, completedSteps, skippedSteps, answers, timestamps; one transaction per action); `complete()` and `restart()` also set or clear the persona's `onboardingComplete` in the same transaction. Step changes: `py_personas` (name, title), `py_organizations` (name), `py_personas` and `py_memberships` (one new member per invited address, joined directly without an invitation token), and the theme preference (control state, not the data database).
5. Failure states: validation errors per field ("Enter your full name", "Use fictional addresses at example.com", "That's your own email"), "Finish Profile and Workspace first." on Finish, permission denied, simulated offline or failure.

Gap: a step's change runs before and outside the wizard's transaction, so
a failure in `submit` can leave the new name or invited member in place
while the wizard stays on the step. The Profile change does not go through
`environment.run`, so it is written even in the offline scenario.

## Switch or create a workspace

1. Header → the workspace switcher → another workspace, or "Create
   workspace" → name → create. The new workspace becomes active.
2. Service: `workspaces.switchTo(organizationId)` and `workspaces.create({ name })` (`createWorkspaces`, packages/saas/src/workspaces.ts)
3. Capability: switching needs a membership in that workspace (no capability); creating needs `workspaces:create` (owner and admin through `*`)
4. Writes: switch changes only the session's active organization (control state); create (one identity transaction) `py_organizations` and `py_memberships` (role `owner`), then switches to it
5. Failure states: not a member, validation errors on the name, permission denied (shown in the dialog), simulated offline or failure on create

## Invite a teammate

1. Team (`#/settings/members`) → invite email and role → "Invite". The
   status line says "Invitation added to the simulated inbox."; the person
   appears under "Pending invitations" with "Revoke".
2. Service: `invitations.create({ email, role })`; "Revoke" calls `invitations.revoke(invitationId)` (`createInvitationServices`, packages/saas/src/invitations.ts)
3. Capability: `members:invite` with `{ organizationId }` (owner, admin, member); inviting as `owner` also needs `members:transfer` (owner and admin through `*`)
4. Writes (one identity transaction): create `saas_tokens` (`invite`, 7 days), `saas_invitations` (status `pending`), `saas_inbox` (the invitation with an "Accept invitation" action); revoke `saas_invitations` (status `revoked`, tokenId `null`) and `saas_tokens` (consumedAt)
5. Failure states: "This person is already a member.", unknown role, invalid or non-fictional email, "Only pending invitations can be revoked.", permission denied, simulated offline or failure (message shown inline)

The kit's `invitations.resend` is not reachable from any screen.

## Accept an invitation

1. Inbox → "Accept invitation" (`#/invites/accept?token=…`, alias
   `#/invite?token=…`) → for a new person, an optional name and password →
   accept. Expired, used, revoked or unknown links show their own state
   instead of the button. The `pending-invite` scenario seeds one such
   invitation.
2. Service: `invitations.accept({ tokenId, name?, password? })` (packages/saas/src/invitations.ts); the screen reads `invitations.preview(tokenId)` first
3. Capability: none (the token stands for owning the mailbox)
4. Writes (one identity transaction): `saas_tokens` (consumedAt), `saas_invitations` (status `accepted`, acceptedAt, acceptedBy), `py_memberships` (the invited role), and for a new person `py_personas` and `saas_accounts`; then the session signs in and switches to that workspace, unless the account has active MFA (then the screen sends the person to sign in)
5. Failure states: "This invitation is not valid.", "… is no longer available.", "… was already used.", "… has expired. Ask for a new one.", "This person is already a member.", simulated offline or failure

## Change a member's role or remove a member

1. Team → a member's role select, or "Remove". Without the capability the
   controls are disabled ("Your simulated role cannot manage members.").
2. Service: `runtime.members.changeRole(membershipId, role)` and `runtime.members.remove(membershipId)` (packages/runtime/src/members.ts)
3. Capability: `members:update` / `members:remove` (owner and admin through `*`); promoting to, demoting from or removing an `owner` also needs `members:transfer`
4. Writes (one identity transaction): `py_memberships` (role, or the row removed). The member's account, tokens and inbox rows stay.
5. Failure states: the last owner cannot be demoted or removed, unknown role, permission denied, simulated offline or failure (message shown inline)

## Read the simulated inbox

1. Signed in: the header inbox drawer or Inbox (`#/inbox`). It opens the
   signed-in persona's address; any other fictional `@example.com` address
   can be typed and opened. Per message: "Open <action>" (marks it read and
   follows the in-app link), "Mark as read", "Archive".
2. Service: `inbox.markRead(id)`, `inbox.archive(id)` (`createInbox`, packages/saas/src/inbox.ts)
3. Capability: none; the inbox is not scoped to the signed-in persona
4. Writes (one transaction): `saas_inbox` (readAt; archive sets archivedAt and readAt)
5. Failure states: simulated offline or failure ("This message could not be marked as read. Try again.", "… could not be archived.")

## Choose a plan and check out

1. Plans (`#/billing/plans`, also the trial banner's "View plans") →
   "Choose Pro" or "Choose Team" → Checkout (`#/billing/checkout?plan=…`)
   → "Confirm simulated payment". The result card shows the outcome, the
   invoice and the subscription. The outcome is always `success` (the
   outcome picker is not enabled in this prototype).
2. Service: `billing.upgrade({ planId, outcome })` when there is a non-trial subscription on another plan, else `billing.checkout({ planId, outcome })` (`createBilling`, packages/saas/src/billing.ts)
3. Capability: `billing:manage` (owner and admin through `*`). Members and viewers can open the pages but get the permission error inline.
4. Writes (one transaction): `saas_invoices` (new invoice with lines in integer cents: the plan price × seats, or proration lines for an upgrade), `saas_subscriptions` (created, or updated to the plan with status `active`), `py_organizations` (plan, billingStatus `active`, trialEndsAt `null`, seats, billingInterval, currentPeriodEnd), `saas_inbox` (a receipt when the amount is above zero)
5. Failure states: "The selected plan is not an upgrade." (choosing Pro while on Team: there is no downgrade path in the UI), unknown plan, permission denied, simulated offline or failure

## Cancel or resume the subscription

1. Billing portal (`#/billing/portal`) → "Cancel at period end" (shown for
   an active or trialing subscription) or "Resume subscription" (shown once
   a cancellation is scheduled). A past-due subscription shows neither.
2. Service: `billing.cancel()` / `billing.resume()` (packages/saas/src/billing.ts)
3. Capability: `billing:manage` (owner and admin)
4. Writes (one transaction): `saas_subscriptions` (cancelAtPeriodEnd `true` or `false`)
5. Failure states: "No active subscription to cancel.", "No subscription to resume.", permission denied, simulated offline or failure

## Expire a trial when time advances

1. DevTools → advance the simulated clock past `trialEndsAt` (for example
   three days in `trial-ending`). No user action in the app.
2. Service: `billingTimeline` (registered as the prototype `timeline`), applied by `scenarios.advance()`
3. Capability: none (simulation control)
4. Writes (one transaction with the advance): `saas_subscriptions` (status `expired`), `py_organizations` (billingStatus `expired`), `saas_inbox` (a "Your simulated trial has ended" message to the owner)
5. Failure states: none in the UI

## Edit profile settings

1. Settings (`#/settings`, Profile tab) → display name, avatar color, time
   zone → "Save profile".
2. Service: `settings.updateProfile({ name, timezone, avatarColor })` (`createSettingsServices`, packages/saas/src/settings.ts)
3. Capability: `profile:update` (owner and admin through `*`; members and viewers see "Your simulated role cannot edit profile settings.")
4. Writes (one identity transaction): `py_personas` (name, timezone, avatarColor)
5. Failure states: validation errors ("Enter at least 2 characters", "Choose a valid six-digit color"), permission denied, simulated offline or failure

## Change password, set up MFA or sign out

1. Settings → Security: current and new password → "Change password";
   "Set up simulated MFA" → the screen shows the simulated code → type it →
   "Confirm MFA"; "Sign out". Without the capability every control is
   disabled ("Your simulated role cannot change security settings.").
2. Service: `settings.changePassword({ currentPassword, newPassword })`, `settings.enrollMfa()` then `settings.confirmMfaEnrollment(code)` (which call `mfa.enroll()` and `mfa.confirmEnroll(code)`), `settings.signOutEverywhere()` (which calls `auth.signOut()`)
3. Capability: `settings:security` (owner and admin through `*`)
4. Writes (one transaction each): `saas_accounts` (simulatedPassword); `saas_mfa` (a `pending` factor with seed and 8 recovery codes, then status `active`) and `saas_sessions_log`; sign-out writes `saas_sessions_log` (`sign-out`) and ends the session, then the app goes to sign in
5. Failure states: "That simulated password is not correct.", "Use at least 8 characters", "MFA is already active on this account.", "That simulated code is not correct.", permission denied, simulated offline or failure

Gap: Security is the only sign-out control in Lattice, so members and
viewers cannot sign out from the UI (persona switching in DevTools still
works).

## Edit notification preferences

1. Settings → Notifications → toggle product updates, security alerts and
   workspace activity → "Save preferences".
2. Service: `settings.updateNotificationPreferences(preferences)` (packages/saas/src/settings.ts)
3. Capability: `settings:notifications` (owner and admin through `*`)
4. Writes (one transaction): `saas_accounts` (notificationPreferences)
5. Failure states: permission denied (the tab says "Your simulated role cannot edit notification preferences."), simulated offline or failure

The saved preferences are stored but nothing in Lattice reads them to
decide which messages to deliver.
