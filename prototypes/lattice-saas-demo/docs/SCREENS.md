# Lattice: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

The routes are declared in `latticeRoutes` (`src/saas.ts`, used by
`src/App.svelte`): `/`, then the SaaS kit's `saasRoutes({ homePath: '/app',
onboardingPath: '/onboarding', lazy: true })` without its `inbox` and
`onboarding` groups, then Lattice's own `/inbox` and `/onboarding`, then
`/app` and `/projects`. The kit screens are lazy chunks from
`@protoyard/saas-ui`; Overview, Projects, Inbox and Onboarding are this
prototype's own screens (Inbox and Onboarding wrap the kit's `InboxDrawer`
and `OnboardingWizard`). `LATTICE_SAAS_UI` configures the kit screens: the
SSO providers on sign-in and sign-up and the sign-up hand-off to the
pending inbox. The router revalidates guards whenever the session changes.

| Route | Screen | Source | Guard |
| --- | --- | --- | --- |
| `#/` | Landing (signed out) or Overview (signed in), title "Plan your work" | `src/screens/Dashboard.svelte` | — |
| `#/app` | Overview | `src/screens/Dashboard.svelte` | signed in and onboarded |
| `#/projects` | Projects | `src/screens/Projects.svelte` | signed in and onboarded |
| `#/sign-in` | Sign in | kit | guests only (signed in → `?next=` or `#/app`) |
| `#/sign-up` | Sign up | kit | guests only |
| `#/auth/magic` | Magic link | kit | — |
| `#/auth/mfa` | Multi-factor | kit | — |
| `#/auth/reset` | Reset password | kit | — |
| `#/auth/verify` | Verify email | kit | — |
| `#/oauth/:provider/consent` | Provider consent | kit | — |
| `#/oauth/:provider/link` | Link provider account | kit | — |
| `#/inbox` | Inbox (signed in), or the pending sign-up inbox with `?account=` | `src/screens/Inbox.svelte` | signed in, or `?account=` present |
| `#/onboarding` | Onboarding | `src/screens/Onboarding.svelte` | signed in |
| `#/billing/plans` | Plans | kit | signed in |
| `#/billing/checkout` | Checkout | kit | signed in |
| `#/billing/portal` | Billing portal | kit | signed in |
| `#/settings/:tab?` | Settings (Profile, Security, Members, Notifications) | kit | signed in |
| `#/invites/accept`, `#/invite` | Accept invitation | kit | — |

States that apply to every screen:

- **Guards.** "Signed in" sends a signed-out visitor to `#/sign-in?next=…`.
  "Onboarded" also sends a persona whose onboarding is unfinished to
  `#/onboarding`. No route checks a capability: per-role differences are
  disabled or hidden controls, and the services enforce the same checks
  (see [FLOWS.md](FLOWS.md)).
- **Loading.** The router shows "Loading screen" while a kit chunk loads,
  and "This screen could not be loaded" with "Try again" if it fails. An
  unknown path shows "Page not found".
- **Errors.** Overview and Projects show "Could not load projects: …" if the
  local query fails. Write failures appear as toasts and inline messages.
- **Simulation notices.** Kit screens say "Simulation only" where they
  would touch email, passwords or payments.

### Landing (`#/` signed out)

- **Purpose:** the public marketing page.
- **Data:** a headline, two calls to action, and a static "Team overview"
  mock-up for Northstar Studio (fixed numbers and three sample projects; not
  read from the database).
- **Actions:** "Create your workspace" (`#/sign-up`), "Explore a demo
  account" (`#/sign-in`); header "Sign in" and "Start your workspace".

### Overview (`#/app`, and `#/` signed in)

- **Purpose:** the workspace home.
- **Data:** "Planning overview · Northstar Studio" (the workspace name in
  this line is fixed text), "Good morning, <first name>.", counts of active,
  planning and complete projects in the active workspace, a "Team momentum:
  On track" card (static text, not computed), the first four projects of
  the workspace (in id order, not by recency) with status, the "Bring your
  team in" card and the active workspace name.
- **Actions:** "New project" (to Projects, with `projects:create`), "All
  projects" and each project's "Open" (to `#/projects`; there is no project
  detail), "Manage members" (`#/settings/members`), "Workspace settings"
  (`#/settings`, which opens the Profile tab).
- **Loading:** "Loading your portfolio…". **Empty:** "Your portfolio starts
  here" with "Create a project" (with `projects:create`). **Error:** "Could
  not load projects: …".
- **Note:** `#/` has no guard, so a signed-in persona with unfinished
  onboarding still sees this overview there; `#/app` redirects them.

### Projects (`#/projects`)

- **Purpose:** the workspace's project portfolio.
- **Data:** a count badge, one card per project (name, summary or "A shared
  plan for the next team milestone.", status, updated date).
- **Actions:** the status select (`projects.update`), the trash button
  (`projects.remove`, no confirmation), the "Create a project" form
  (`projects.create`); "Workspace overview" back link. A status line shows
  the last result.
- **Loading:** "Loading project portfolio…". **Empty:** "Start with one clear
  outcome". **Error:** "Could not load projects: …".
- **Denied:** without `projects:update` the select is disabled; the trash
  button needs `projects:delete` (owner and admin); without
  `projects:create` the form is disabled with "Your simulated viewer role
  can review this portfolio but cannot change projects."

### Sign in, Sign up, Magic link, Multi-factor, Reset password, Verify email

- **Purpose:** the simulated account journeys ([FLOWS.md](FLOWS.md#sign-in-with-a-password)).
- **Data and actions:** email and password forms with "Show password";
  Sign in links to "Create account", "Use a magic link" and "Forgot
  password?"; Sign in and Sign up show, under an "or" divider, "Continue
  with Google", "Continue with Microsoft" and "Continue with GitHub", each
  with a neutral key icon and a "Simulated" label, under the note
  "Simulated sign-in: no provider is contacted and nothing leaves this
  browser."; Sign up ends on "Check your simulated inbox" with "Open
  simulated inbox" (`#/inbox?account=…`) and "Return to sign in"; Multi-factor
  shows the simulated authenticator code and accepts a code or a recovery
  code; Verify email confirms the token from the link; Magic link and Reset
  password send a link and then consume it from `?token=`.
- **States:** field errors inline, form errors as a message ("Confirm your
  email first. Check your simulated inbox.", "This sign-in link was already
  used."), busy buttons ("Signing in", "Creating account"), "Open the
  confirmation action from your simulated inbox." without a token.
- **Links:** every link on these screens is an in-app `#/…` route
  (`#/sign-up`, `#/auth/reset`, `#/sign-in`).
- **Limit:** a signed-out visitor can open only the inbox of a pending
  (unverified) sign-up; magic-link and reset messages for a confirmed
  account are not reachable while signed out.

### Provider consent and Link provider account (`#/oauth/:provider/…`)

- **Purpose:** the simulated OAuth consent ("Approve" / "Deny", the
  information requested) and the confirmation to link a provider.
- **States:** "This provider is not supported by the simulator.", a
  missing-state message, "Redirecting…"; linking while signed out goes to
  sign in with `?next=`.
- **Reachability:** the "Continue with …" buttons on Sign in and Sign up
  start a consent. Approving a new identity goes to `#/onboarding`, a
  linked one to `#/`; Deny returns to `#/sign-in`.

### Onboarding (`#/onboarding`)

- **Purpose:** "Set up your Lattice workspace": the four-step setup wizard
  (Profile, Workspace, Invite teammates, Preferences, then Done) with a
  progress bar.
- **Actions:** Next (validates, then saves the answer and its changes in one
  transaction), Back, Skip (optional steps), Finish ("Go to the app"),
  Restart (confirmed).
- **Loading / errors:** a loading state while the saved position loads;
  field errors inline; a form message for other failures (for example the
  simulated offline message). A failed Next changes nothing and keeps the
  person on the step.
- **Denied:** the Workspace step is read-only without `workspaces:rename`
  ("Only people who manage the workspace can rename it. Review it and
  continue."); the Invite step refuses addresses without `members:invite`.

### Inbox (`#/inbox` and the header drawer)

- **Purpose:** the simulated mailbox ("Simulated inbox").
- **Data:** messages for the opened address, newest first: subject, kind,
  time, body, "Unread" badge.
- **Actions:** type a fictional `@example.com` address and "Open inbox";
  per message "Open <action>", "Mark as read", "Archive".
- **Pending sign-up (signed out, `?account=`):** "You are not signed in yet.
  Open the confirmation message to verify your email, then sign in.", then
  "Messages for <address>" without the address form, and only that
  account's messages.
- **States:** "Loading simulated messages…"; "Enter the address used by
  this prototype to view its simulated messages."; "No messages for
  <address>."; "The simulated inbox could not load. Try again."; signed out
  with an unknown, verified, locked or disabled account: "This inbox link
  only works for an account waiting for email confirmation. Sign in to read
  your inbox." with "Go to sign in"

### Plans, Checkout and Billing portal (`#/billing/…`)

- **Plans:** the two plans with price per seat per month ("$19.00 / month /
  seat" style, formatted from cents), the trial length and a "Current"
  badge; "Choose <plan>" goes to checkout. On the current plan the button
  says "Manage in portal" but still links to checkout. "Open billing
  portal" at the bottom.
- **Checkout:** the selected plan, "Simulated payment — no card, no
  charge.", "Confirm simulated payment", then a result card with the
  outcome, invoice id, amount and status, and the subscription. Errors
  (permission, "The selected plan is not an upgrade.") show inline.
  "Select a plan from the pricing page." without a plan.
- **Billing portal:** current plan, status, seats, price per seat, current
  period, trial end, "Cancels at period end"; invoices ("Amounts are integer
  cents formatted for display."); "Cancel at period end" / "Resume
  subscription"; "Change plan". **Empty:** "No active subscription." with
  "Browse plans"; "No invoices yet."
- **Denied:** members and viewers can read all three pages; checkout,
  cancel and resume fail with the `billing:manage` error inline.

### Settings (`#/settings/:tab?`)

- **Purpose:** four tabs: Profile (default), Security, Members,
  Notifications.
- **Profile:** display name, avatar color, time zone, "Save profile".
- **Security:** change the simulated password, set up and confirm
  simulated MFA (status "enabled", "setup pending" or "not enabled"),
  linked providers ("No providers are linked to this simulated account."),
  "Sign out".
- **Members:** invite form (email and role), current members with a role
  select and "Remove", pending invitations with "Revoke" ("No pending
  invitations.").
- **Notifications:** three toggles and "Save preferences".
- **Denied:** each tab disables its controls and says so: "Your simulated
  role cannot edit profile settings." (`profile:update`), "… cannot change
  security settings." (`settings:security`), "… cannot manage members."
  (`members:invite`, `members:update`, `members:remove`), "… cannot edit
  notification preferences." (`settings:notifications`). Owner rows need
  `members:transfer`.

### Accept invitation (`#/invites/accept`, `#/invite`)

- **Purpose:** join a workspace from an invitation link.
- **Data:** the workspace, inviter and role from `preview`; "You already
  have an account with this email. Accepting adds you to the workspace."
  for an existing account; a notice when someone else is signed in.
- **Actions:** "Your name" and "Password (optional)" for a new person, then
  accept; "Open inbox" and "Go to sign in" where relevant.
- **States:** "Checking your invitation"; expired, used, withdrawn and
  unknown links show their own message; an MFA account is told to sign in
  with its authenticator.

## Shell

`protoyard.json` sets `"preview": { "viewport": "desktop" }` and
`"platform": "responsive"`: the prototype is designed for a desktop browser
and previewed at a desktop viewport, and the layout also works on smaller
screens (the navigation wraps and scrolls horizontally). It does not use
`AppShell`: `src/App.svelte` renders a sticky top header with the
"lattice" logo. Signed in, it shows the trial banner above the header (only
while the subscription is trialing, with days left on the simulated clock
and "View plans"), the workspace switcher, links to Overview, Projects,
Team, Inbox, Plans and Settings, the inbox drawer and "Sign out" (every
role; it goes to `#/sign-in`). Signed out, it shows
an "Interactive product simulation" chip, "Sign in" and "Start your
workspace". Content is centered with a maximum width of `max-w-7xl`, and a
footer says that authentication, invitations, plans and billing are
simulated locally. The default theme is `violet` with the system light or
dark mode.
