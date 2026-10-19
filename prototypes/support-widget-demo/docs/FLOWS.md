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
4. Writes: deletes the old reply from `messages` directly (not inside
   `environment.run` and not in a transaction with the new reply), then
   starts a new reply to the same prompt exactly as in
   [Send a message and receive a scripted reply](#send-a-message-and-receive-a-scripted-reply):
   a new `messages` row that streams, and `conversations.lastMessageAt`.
5. Failure states: permission denied; returns `null` and writes nothing when
   the reply or its prompt no longer exists (the seeded greeting and
   messages written by `requestReturn` have no prompt). Because the delete
   happens before `environment.run('assistant.reply')`, a retry during the
   outage or offline replaces the failed reply with a new failed one rather
   than leaving it untouched.

## Read the thread and update the launcher badge

1. Whenever the message list changes (a new message, or the last message
   changing status), `src/App.svelte` asks for the unread count and passes
   it to the widget host's launcher badge (`tryGetWidgetHost()?.setUnread`),
   and marks the thread as read.
2. Service: `chat.markRead(conversationId)` in src/domain/chat.ts; the badge
   count comes from `chat.unreadCount(conversationId, personaId)` (read
   only: messages after the persona's `lastReadAt` not written by that
   persona).
3. Capability: none. `markRead` has no `session.assert` and does not go
   through `environment.run`.
4. Writes: `reads` (put; id `<conversationId>:<personaId>`, lastReadAt = the
   later of the simulation clock and the thread's `lastMessageAt`).
5. Failure states: none surfaced; nothing happens when the conversation does
   not exist. Both calls run on the same change and are not ordered, and
   `markRead` runs whether or not the panel is open, so the badge usually
   reads 0 (see the gap in [SPEC.md](SPEC.md#honest-boundaries)).

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

1. Widget → order tools strip → type an order number (prefilled with
   `NW-10042`) → **Look up order**. The strip is shown only with
   `orders:lookup`; the input and button are disabled while offline.
2. Service: `chat.lookupOrder(numberOrId)` in src/domain/chat.ts
3. Capability: `orders:lookup` (no record-level rule, and no check that the
   order belongs to the visitor: any order in the browser can be found).
4. Writes: nothing. Inside `environment.run('orders.lookup')` it reads every
   order and returns the first exact match on `number` or `id`
   (case-insensitive), otherwise the first `number` that contains the query.
   The UI shows the order card: number, item summary, ordered date, status,
   tracking code when shipped, and the total.
5. Failure states: permission denied; fewer than 3 characters ("Enter an
   order number like NW-10042."); no match ("No fictional order matches
   …"); simulated offline or server error. Errors appear under the input and
   as a toast, and the card is cleared.

## Start a return

1. Widget → after a lookup, the order card → edit "Return reason"
   (prefilled "Wrong size") → **Start return**. Hidden for cancelled orders
   or without `returns:create`; disabled while offline. The returns list
   under the card updates live.
2. Service: `chat.requestReturn({ orderId, reason, amountCents? })` in
   src/domain/chat.ts (the UI never passes `amountCents`, so the full order
   total is requested)
3. Capability: `returns:create` (no record-level rule).
4. Writes (one transaction inside `environment.run('returns.create')`):
   `returns` (new row: id `ret_…`, orderId, reason trimmed, status
   `requested`, amountCents = `amountCents` floored and at least 0, or the
   order's `totalCents`, createdAt and updatedAt from the simulation clock,
   createdBy = active persona); `messages` (a confirmation in `conv_support`
   from the assistant: "Return <id> opened for <number> (<reason>). Status:
   requested. This is a simulated return — no real refund.");
   `conversations.lastMessageAt` of `conv_support`.
5. Failure states: permission denied; reason under 3 or over 200 characters;
   order not found; cancelled order; a return already open for the order
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
  Capability `orders:lookup`. Read only, inside
  `environment.run('orders.listByEmail')`, exact case-insensitive match on
  `orders.email`.
- **List returns:** `chat.listReturns()`. Capability `returns:read`. Read
  only, newest first, not through `environment.run`. The widget's returns
  list reads the `returns` table directly with `liveQuery` instead, so
  `returns:read` is not checked on screen.
