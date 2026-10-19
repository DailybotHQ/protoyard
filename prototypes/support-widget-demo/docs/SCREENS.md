# Northwind Help: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

There is no router: `src/App.svelte` renders a single screen, the support
widget, with no hash routes. It is the whole panel that opens from the
launcher.

| Path | Screen | Title | Required capability |
| --- | --- | --- | --- |
| (none, single screen) | `src/App.svelte` | Northwind Help | none checked to render; parts are gated as listed below |

### Support widget (`src/App.svelte`)

- **Purpose:** one support thread between the visitor and the scripted
  Northwind Help assistant, with order lookup, returns and a handoff to a
  (simulated) human.
- **Layout, top to bottom:**
  - **Header:** the prototype name and a subtitle, "Northwind Outfitters ·
    fictional demo", or "Human agent connected (simulated)" after a handoff.
  - **Condition banner** (`src/components/ConditionBanner.svelte`): "You are
    offline. Messages can't be sent (simulated)." when the network is
    simulated offline; otherwise, when a failure mode is active, "The
    assistant is having trouble." (failure scope includes `assistant.`, as
    in `outage`) or "Service problems.", followed by "Some requests will
    fail (simulated <mode>)."
  - **Order tools** (shown only with `orders:lookup`): an "Order number"
    input prefilled with the persona's most recent order number (placeholder
    `NW-10040`) and **Look up order**; the order card
    (number, item summary, ordered date, status, tracking code when present,
    total formatted from integer cents); on the card, "Return reason"
    (prefilled "Wrong size") and **Start return** (only with
    `returns:create` and when the order is not cancelled); a list of the
    returns on the persona's own orders (every return for an `agent`; id,
    status, amount, reason), newest first.
  - **Messages** (`src/components/MessageList.svelte`): grouped by
    consecutive author and by day, with avatars (`Avatar.svelte`); your own
    messages are tinted and marked "(you)"; the assistant is shown as
    "Northwind Help"; an unknown author as "Former member".
  - **Composer area:** a typing indicator ("Northwind Help" while a reply
    streams in this page), **Talk to a human** (only with
    `support:handoff` and before a human has joined), and the composer
    (4,000 characters max).
- **Actions:** send a message; **Stop** a live reply; **Retry** a failed or
  interrupted reply; **Regenerate** a stopped reply; **Talk to a human**;
  **Look up order**; **Start return**. See [FLOWS.md](FLOWS.md).
- **Streaming:** a reply shows "Thinking…" (no text yet) then "Writing…";
  a stopped one shows "Stopped". A polite live region announces each
  finished assistant reply once ("Assistant replied: …" or "The assistant
  could not reply: …"). The list follows new content only when already near
  the bottom or when the newest message is your own.
- **Empty:** "Starting support chat…" when the thread has no messages
  (every seeded scenario has at least the greeting, so this shows only
  when the thread was created by `ensureSupportThread`, or is missing).
  The returns list is hidden when there are no returns.
- **Loading:** buttons show "Looking up…", "Starting…" and "Connecting…"
  while their service runs.
- **Error:** "Message not sent" toast; a failed reply shows "Reply failed."
  with the simulated error and **Retry**; a reply cut off by a reload shows
  "Reply interrupted by a reload." with **Retry**; order lookup and return
  errors appear in red under the input or on the card and as toasts ("Order
  lookup failed", "Could not start return"); "Could not request a human"
  and "Could not retry" toasts.
- **Offline:** the composer placeholder reads "Offline — messages cannot be
  sent (simulated)" and the composer, order input, Look up, Start return and
  Talk to a human are disabled; Stop, Retry and Regenerate are hidden.
- **Denied:** without `messages:send` the composer is disabled with the
  placeholder "Read-only" and Stop, Retry and Regenerate are hidden; without
  `orders:lookup` the whole order tools strip (including the returns list)
  is hidden; without `returns:create` the return form is hidden; without
  `support:handoff` the handoff button is hidden. With today's roles both
  `visitor` and `agent` hold every capability, so these states only appear
  if the policy changes.

## Shell

`protoyard.json` sets `"platform": "responsive"` and
`"preview": { "viewport": "desktop", "shell": "widget-host", "chrome": { "hostName": "Northwind Outfitters (fictional)" } }`.

The **widget-host** shell (from `@protoyard/renderer-svelte`) draws a
fictional storefront for "Northwind Outfitters (fictional)" and a floating
chat launcher in the bottom-right corner. The launcher ("Open chat" /
"Close chat") opens the app in an anchored panel about 380 × 560 px, full
screen below 480 px wide; Escape closes it and returns focus to the
launcher. The panel starts closed, but the app is mounted from page load.
The app drives the launcher's unread badge (hidden at 0, "9+" above nine)
through the widget host's `setUnread(n)`: messages that arrive while the
panel is closed raise it, and opening the panel marks the thread read and
clears it (see
[FLOWS.md](FLOWS.md#read-the-thread-and-update-the-launcher-badge)).

The default appearance is the `emerald` theme in `system` mode. DevTools are
not included in builds (`build.includeDevtools: false`); in
`pnpm protoyard dev` they are available for switching scenarios, personas
and network conditions. The "Prototype" demo badge is on, and the composer
area adds bottom padding to stay clear of it.
