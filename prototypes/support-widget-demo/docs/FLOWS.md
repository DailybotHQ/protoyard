# Northwind Help: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

In this prototype the services live in **`src/domain/chat.ts`** (there is no
`src/domain/services.ts`): `createChatServices(runtime)` returns them, and
`provideChat()` in `src/lib/context.ts` exposes them to `src/App.svelte` as
`chat`. The UI calls them through `runService`, which shows an error toast
on failure. Inputs are validated with inline checks that throw
`ChatValidationError` (with per-field `issues`), not zod schemas.

Assistant replies are never produced by a real model: `scriptedReply` in
`src/domain/assistant.ts` returns a canned answer, see
[Send a message and receive a scripted reply](#send-a-message-and-receive-a-scripted-reply).

## Open the widget and start the support thread

1. The visitor clicks the chat launcher on the fictional host site; the
   widget panel opens. The app is mounted (and this flow runs) as soon as
   the page loads, whether or not the panel is open: `onMount` in
   `src/App.svelte` calls the service once.
2. Service: `chat.ensureSupportThread()` in src/domain/chat.ts
3. Capability: `chat:read` (no record-level rule).
4. Writes: nothing when the conversation `conv_support` already exists (every
   scenario seeds it). Otherwise, inside `environment.run('conversations.ensure')`,
   one `conversations` row (id `conv_support`, title `Support`,
   createdBy = active persona, createdAt and lastMessageAt from the
   simulation clock, handoffRequested and handoffJoined `false`). A single
   `add`, no explicit transaction. No greeting message is written in this
   case; seeded threads get the greeting from the generator.
5. Failure states: permission denied; simulated offline or server error when
   the thread is missing (the call is fire-and-forget, so nothing is shown
   and the panel keeps saying "Starting support chat…").

## Send a message and receive a scripted reply

1. Widget → type in the composer ("Message support…") and press Enter or
   the send button. The composer is disabled when the network is simulated
   offline or the persona lacks `messages:send`.
2. Service: `chat.send(conversationId, text)` in src/domain/chat.ts, which
   returns `{ message, reply }`; `reply` is a promise that settles when the
   assistant is done.
3. Capability: `messages:send` (no record-level rule). The service does not
   check that the conversation exists.
4. Writes:
   - The message (one transaction inside `environment.run('messages.send')`):
     `messages` (new row, `authorKind: 'person'`, status `sent`, promptId and
     error `null`, `at` from `nextAt`, always after the thread's latest
     message), `conversations.lastMessageAt`, and the sender's `reads` row
     (id `<conversationId>:<personaId>`, lastReadAt = the message's `at`).
   - Then the reply, always (also after a human handoff): one transaction
     adds an empty `messages` row (`authorId: 'assistant'`,
     `authorKind: 'assistant'`, status `streaming`, promptId = the prompt's
     id) and updates `conversations.lastMessageAt`.
   - The reply text comes from `environment.run('assistant.reply')` around
     `scriptedReply(prompt.body)` in `src/domain/assistant.ts`: the first
     keyword topic that matches (order, track, shipping, delivery, where →
     order lookup hint; return, refund, exchange → returns policy; human,
     agent, person, handoff, someone → handoff hint; help, hello, hi →
     introduction), otherwise one of three fallbacks picked by a seeded
     generator keyed on the trimmed, lower-cased prompt. It is deterministic
     and never calls a model. `chunkReply` splits it into chunks of two to
     five words (with their spaces); each chunk updates `messages.body`
     about every 45 ms (not in a transaction), so a reload shows what had
     arrived.
   - When the stream ends: `messages.status` becomes `sent`.
5. Failure states: permission denied; empty or over 4,000 characters
   (rejected before anything is written); simulated offline or server error
   on `messages.send` (nothing written, "Message not sent" toast);
   simulated failure on `assistant.reply` (the `outage` scenario fails every
   `assistant.` operation): the prompt stays saved and the reply row becomes
   status `failed` with an empty body and `error` = the simulated error
   message, shown as "Reply failed." with **Retry**.

## Stop a streaming reply

1. Widget → **Stop** next to a reply that shows "Thinking…" or "Writing…"
   (only for replies streaming in this page, and only with `messages:send`
   and the network online).
2. Service: `chat.cancel(replyId)` in src/domain/chat.ts (`chat.isLive(replyId)`
   tells the UI whether the reply streams in this page)
3. Capability: none. `cancel` has no `session.assert` and does not go
   through `environment.run`.
4. Writes: for a live reply, nothing immediately; the stream loop sees the
   request before its next chunk and sets `messages` (body = text so far,
   status `stopped`). For a reply cut off by a reload (status `streaming`
   but not live), `messages.status` = `stopped` directly. The UI only
   offers Stop for live replies; an interrupted reply offers Retry instead.
5. Failure states: none by design; a reply that is not streaming is left
   untouched.

## Retry a failed, stopped or interrupted reply

1. Widget → **Retry** on a failed reply ("Reply failed.") or on a reply
   "interrupted by a reload", or **Regenerate** on a stopped reply. Shown
   only when `messages:send` is held and the network is online.
2. Service: `chat.retry(replyId)` in src/domain/chat.ts
3. Capability: `messages:send` (no record-level rule).
4. Writes (one transaction inside `environment.run('assistant.reply')`):
   deletes the old reply from `messages`, adds the new empty `streaming`
   reply to the same prompt (`at` from `nextAt`) and updates
   `conversations.lastMessageAt`. The reply then streams chunk by chunk
   exactly as in
   [Send a message and receive a scripted reply](#send-a-message-and-receive-a-scripted-reply)
   and ends `sent` (or `stopped`).
5. Failure states: permission denied; returns `null` and writes nothing when
   the reply or its prompt no longer exists (the seeded greeting and
   messages written by `requestReturn` have no prompt) or the reply is still
   streaming in this page. A simulated failure on `assistant.reply` (the
   `outage` scenario, or offline) rejects before anything is written: the
   old reply stays exactly as it was and a "Could not retry" toast shows.

## Read the thread and update the launcher badge

1. Whenever the message list changes (a new message, or the last message
   changing status) or the panel opens or closes, `src/App.svelte` queues
   one badge update (`createUnreadSync` in `src/lib/unread.ts`). Updates run
   one at a time, in order, and an update replaced by a newer one is
   skipped, so the badge always ends on the latest state:
   - **Panel open** (the visitor is viewing the thread): mark the thread
     read, then set the badge to 0.
   - **Panel closed:** leave the read marker alone and set the badge to the
     unread count, so messages that arrive while the panel is closed (a
     reply that finishes after closing, the handoff message, a return
     confirmation) raise it.

   Whether the panel is open comes from the widget host's `isOpen()`
   (`WidgetPanel` in `src/lib/widget-panel.svelte.ts`); the badge is set
   with its `setUnread`. The host frame loads lazily: until it has mounted
   the panel counts as closed (it starts closed), and outside the
   widget-host shell the app is the whole page and counts as open.
2. Service: `chat.markRead(conversationId)` in src/domain/chat.ts; the badge
   count comes from `chat.unreadCount(conversationId, personaId)` (read
   only: messages after the persona's `lastReadAt` not written by that
   persona). Sending a message also moves the sender's marker
   (see the send flow).
3. Capability: none. `markRead` has no `session.assert` and does not go
   through `environment.run`.
4. Writes: `reads` (put; id `<conversationId>:<personaId>`, lastReadAt = the
   later of the simulation clock and the thread's `lastMessageAt`).
5. Failure states: none surfaced; nothing happens when the conversation does
   not exist or there is no active persona. A failed update is logged and
   the next change runs normally.

## Talk to a human

1. Widget → **Talk to a human** above the composer (hidden once a human has
   joined, disabled while offline).
2. Service: `chat.requestHandoff(conversationId)` in src/domain/chat.ts
3. Capability: `support:handoff` (no record-level rule).
4. Writes (one transaction inside `environment.run('support.handoff')`):
   `conversations` (handoffRequested `true`, handoffJoined `true`,
   lastMessageAt) and one scripted `messages` row authored by the fixed
   persona id `user_agent` (`authorKind: 'person'`, status `sent`): "Hi, I am
   Casey from support (fictional). I joined this thread — how can I help?".
   The "human" joins instantly; nobody is notified and nobody answers
   afterwards (the scripted assistant keeps replying to new messages). The
   header then reads "Human agent connected (simulated)".
5. Failure states: permission denied; "Conversation not found." when the
   thread is missing (checked before `environment.run`); simulated offline
   or server error (nothing written, "Could not request a human" toast).
   The service does not reject a second handoff; only the UI hides the
   button.

## Look up an order

1. Widget → order tools strip → type an order number → **Look up order**.
   The input is prefilled with the active persona's most recent order
   (`chat.latestOrder()`: latest `orderedAt`, ties broken by id), so the
   default lookup exists in every scenario; it follows a persona switch
   until the visitor edits the field. The strip is shown only with
   `orders:lookup`; the input and button are disabled while offline.
2. Service: `chat.lookupOrder(numberOrId)` in src/domain/chat.ts
3. Capability: `orders:lookup`, with the record-level rule `ownsOrder`: a
   visitor can only find orders on their own persona email; an `agent` can
   find any order (see [PERMISSIONS.md](PERMISSIONS.md#record-level-rules)).
4. Writes: nothing. Inside `environment.run('orders.lookup')` it reads the
   orders the persona may see and returns the first exact match on `number`
   or `id` (case-insensitive), otherwise the first `number` that contains
   the query. The UI shows the order card: number, item summary, ordered
   date, status, tracking code when shipped, and the total.
5. Failure states: permission denied; fewer than 3 characters ("Enter an
   order number like NW-10040."); no match among your orders, including
   someone else's order ("No order matching … on your account."); simulated
   offline or server error. Errors appear under the input and as a toast,
   and the card is cleared.

## Start a return

1. Widget → after a lookup, the order card → edit "Return reason"
   (prefilled "Wrong size") → **Start return**. Hidden for cancelled orders
   or without `returns:create`; disabled while offline. The returns list
   under the card updates live.
2. Service: `chat.requestReturn({ orderId, reason, amountCents? })` in
   src/domain/chat.ts (the UI never passes `amountCents`, so the full order
   total is requested)
3. Capability: `returns:create`, with the record-level rule `ownsOrder`
   (a visitor can only return their own orders; an `agent` any order).
4. Writes (one transaction inside `environment.run('returns.create')`):
   `returns` (new row: id `ret_…`, orderId, reason trimmed, status
   `requested`, amountCents = `amountCents` floored and at least 0, or the
   order's `totalCents`, createdAt and updatedAt from the simulation clock,
   createdBy = active persona); `messages` (a confirmation in `conv_support`
   from the assistant: "Return <id> opened for <number> (<reason>). Status:
   requested. This is a simulated return — no real refund.");
   `conversations.lastMessageAt` of `conv_support`.
5. Failure states: permission denied; reason under 3 or over 200 characters;
   order missing or someone else's ("Order not found on your account.");
   cancelled order; a return already open for the order
   (any status except `denied`); an amount above the order total; simulated
   offline or server error (nothing written). Errors appear on the card and
   as a "Could not start return" toast. Orders that are `processing` or
   `shipped` are accepted: only `cancelled` is refused.

## Service-only operations (no UI)

These exist in `src/domain/chat.ts` but no screen calls them today. They are
covered here so every service is mapped.

- **Create another conversation:** `chat.createConversation({ title })`.
  Capability `messages:send` (not a create capability). Title trimmed, 2 to
  60 characters. Writes one `conversations` row (createdBy = active persona,
  handoff flags `false`) inside `environment.run('conversations.create')`.
  Kept for parity with the chat template; the widget only uses
  `conv_support`.
- **List orders for an email:** `chat.listOrdersForEmail(email)`.
  Capability `orders:lookup` with the `ownsOrder` rule: a visitor may only
  pass their own email (otherwise "You can only list the orders on your own
  email."). Read only, inside `environment.run('orders.listByEmail')`,
  exact case-insensitive match on `orders.email`.

The widget also reads through two read-only services that have no flow of
their own, both outside `environment.run`:

- **Most recent order:** `chat.latestOrder()` prefills the order input (see
  [Look up an order](#look-up-an-order)). It returns `null` without
  `orders:lookup`.
- **List returns:** `chat.listReturns()`. Capability `returns:read`.
  Newest first, only returns on orders the persona may see. The widget's
  returns list reads it through `liveQuery`.
