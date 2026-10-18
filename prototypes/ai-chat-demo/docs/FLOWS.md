# Relay — team AI chat: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

In this prototype the services come from `createChatServices(runtime)` and
the UI reaches them as `services` (from `useChat()` in `src/lib/context.ts`),
always through `runService`, which shows a success or error toast. Inputs are
validated with inline checks (trimmed text, minimum and maximum lengths), not
zod schemas. Agent replies are never produced by a real model: see
[Send a message and receive an agent reply](#send-a-message-and-receive-an-agent-reply).

## Start a conversation

1. Conversation list → **New** opens the "New conversation" dialog: a name
   (required, 2+ characters), agents (Atlas is preselected) and optional
   teammates. Shortcut: **Ask Atlas** (welcome screen or the empty list on a
   phone) or **Ask <agent>** in the agent directory creates "Ask <agent>"
   with that one agent. On success the app navigates to `#/c/:id`.
2. Service: `services.createConversation({ title, agentIds, memberIds })` in src/domain/services.ts
3. Capability: `conversations:create` (no record-level rule). The **New** and
   **Ask** buttons are hidden without it.
4. Writes (one transaction inside `environment.run('conversations.create')`):
   `conversations` (id, title trimmed and cut to 60 characters, kind `direct`
   when agents plus invited teammates number one or fewer, otherwise
   `channel`, createdBy = active persona, createdAt, lastMessageAt,
   pinned `false`, archived `false`); `participants` (one row per person: the
   creator plus invited teammates, `memberKind: 'person'`; one row per agent,
   `memberKind: 'agent'`; every `lastReadAt` = createdAt).
5. Failure states: permission denied; a name under 2 characters (rejected in
   the dialog and again in the service); simulated offline or server error
   (nothing written, the dialog stays open with an error toast).

## Send a message and receive an agent reply

1. Thread → type in the composer (with @mention autocomplete or the agent
   chips) and press Enter, or click a starter prompt in an empty thread.
2. Service: `services.send(conversationId, text)` in src/domain/services.ts,
   which returns `{ message, runs }`; replies then run on their own.
3. Capability: `messages:send` for the message. Replies additionally need
   `agents:invoke`, checked with `session.can`: without it the message is
   saved and no agent replies. No record-level rule. The service also rejects
   archived or missing conversations.
4. Writes:
   - The message (one transaction inside `environment.run('messages.send')`):
     `messages` (new row, `authorKind: 'person'`, status `sent`, runId
     `null`, `at` from the simulation clock but always after the
     conversation's latest message), `conversations.lastMessageAt`, and the
     sender's `participants.lastReadAt`.
   - Then, for every @mentioned agent in the conversation (or the only agent
     when the conversation has exactly one), one run: a transaction adds a
     `runs` row (status `streaming`, promptMessageId, startedAt, tokens 0)
     and an empty reply in `messages` (`authorKind: 'agent'`, status
     `streaming`, runId), and updates `conversations.lastMessageAt`.
   - The reply text comes from `environment.run('agents.<handle>')` around
     `scriptedReply(agent, prompt)` in `src/domain/agents.ts`: a canned
     answer picked by keyword (summary, release notes, incident or status,
     comparison) or one of three fallbacks, chosen by a seeded random
     generator keyed on the agent id and the prompt. It is deterministic and
     never calls a model. `chunkReply` splits it into chunks of three to six
     words; each chunk updates `messages.body` about every 45 ms, so a reload
     shows what had arrived.
   - When the stream ends, one transaction sets `runs` (status `done`,
     finishedAt, tokens = ceil(characters / 4)) and the reply's
     `messages.status` to `sent`.
5. Failure states: permission denied (viewer: the composer is disabled with
   the reason); empty or over 4,000 characters (rejected); archived
   conversation (rejected); simulated offline or server error on
   `messages.send` (nothing written, "Message not sent" toast, the draft is
   kept); simulated failure on `agents.<handle>` (for example the
   `agent-outage` scenario): the prompt stays saved, the run ends with status
   `error` and the error text, and the reply row becomes status `failed` with
   the error as its body, shown with **Retry**.

## Stop a streaming reply

1. Thread → **Stop** on a streaming reply, or the composer's stop button
   (stops every reply streaming in this page). After a reload, a reply cut
   off mid-stream shows "Reply interrupted" with **Retry** instead.
2. Service: `services.cancel(runId)` in src/domain/services.ts
   (`services.isLive(runId)` tells the UI whether the run streams in this page)
3. Capability: none. `cancel` has no `session.assert`; the Stop buttons only
   appear for runs streaming in the current page.
4. Writes: for a live run, nothing immediately; the stream loop sees the
   request before its next chunk and one transaction sets `runs` (status
   `cancelled`, finishedAt, tokens) and `messages` (body = text so far,
   status `sent`, shown as "Stopped"). For a run orphaned by a reload (status
   `streaming` but not live), the same transaction runs directly, or only
   `runs` (status `cancelled`, finishedAt) when the reply row is gone.
5. Failure states: none by design. `cancel` does not go through
   `environment.run`, so it also works offline; a run that is not streaming is
   left untouched.

## Retry a failed or interrupted reply

1. Thread → **Retry** on a failed reply, or on an interrupted one after a
   reload.
2. Service: `services.retry(runId)` in src/domain/services.ts
3. Capability: `agents:invoke` (no record-level rule); the conversation must
   not be archived.
4. Writes: inside `environment.run('messages.retry')`, deletes the old reply
   from `messages` (rows with that runId). The old `runs` row is kept as it
   was (`error`, or `streaming` for an interrupted run). Then a new run starts exactly as in
   [Send a message and receive an agent reply](#send-a-message-and-receive-an-agent-reply),
   with the original prompt: a new `runs` row and a new streamed reply in
   `messages`.
5. Failure states: permission denied; archived conversation (rejected);
   simulated offline on `messages.retry` (nothing deleted, the failed reply
   stays, "Could not retry" toast); the agent call failing again (the new
   reply is marked `failed`). Returns `null` and writes nothing when the run,
   agent or prompt no longer exists.

## Read a thread and clear its unread badge

1. Open a conversation. The thread calls `markRead` when it opens and again
   whenever a new message arrives or finishes while the page is visible (not
   on every streamed chunk). The list shows unread badges per conversation.
2. Service: `services.markRead(conversationId)` in src/domain/services.ts;
   badges come from `services.unreadCount(conversationId, personaId)` (read
   only: messages after `lastReadAt` not written by that persona).
3. Capability: none. Any persona that is a participant updates only its own
   participant row.
4. Writes: `participants.lastReadAt` for the active persona in that
   conversation, set to the later of the simulation clock and the
   conversation's `lastMessageAt` (replies can be stamped ahead of a frozen
   clock).
5. Failure states: none surfaced. It does not go through `environment.run`,
   so it works offline; a persona that is not a participant has no row to
   update.

## Pin or unpin a conversation

1. Thread header → conversation menu (⋯) → **Pin to top** or **Unpin**.
   Pinned conversations sort first in the list.
2. Service: `services.togglePin(conversationId)` in src/domain/services.ts
3. Capability: `messages:send` (not `conversations:manage`), so a member can
   pin any conversation they can open. No record-level rule.
4. Writes (read and write in one transaction inside
   `environment.run('conversations.pin')`): `conversations.pinned`. The flag
   is on the conversation, so it applies to every persona in this browser.
5. Failure states: permission denied (viewer: the menu item is hidden);
   simulated offline or server error (nothing written, error toast).

## Rename a conversation

1. Thread header → conversation menu → **Rename…** → edit the name → **Save**.
2. Service: `services.rename(conversationId, title)` in src/domain/services.ts
3. Capability: `conversations:manage` with the record-level rule: a `member`
   only for conversations they created (`createdBy`).
4. Writes: `conversations.title` (trimmed, cut to 60 characters), inside
   `environment.run('conversations.rename')`.
5. Failure states: permission denied (the menu item is hidden); a name under
   2 characters (rejected in the dialog and in the service); simulated
   offline or server error (nothing written, the dialog stays open).

## Archive or unarchive a conversation

1. Thread header → conversation menu → **Archive** or **Unarchive**, or the
   **Unarchive** button in an archived thread's banner. Archived
   conversations move to the list's Archived view and become read-only.
2. Service: `services.archive(conversationId, archived)` in src/domain/services.ts
   (`archived` defaults to `true`; unarchive passes `false`)
3. Capability: `conversations:manage` with the record-level rule (members:
   own conversations only).
4. Writes: `conversations.archived`, inside `environment.run('conversations.archive')`.
5. Failure states: permission denied (the actions are hidden); simulated
   offline or server error (nothing written, error toast). While archived,
   `send` and `retry` are rejected by the service.

## Delete a conversation

1. Thread header → conversation menu → **Delete…** → confirm in the dialog.
   On success the app returns to `#/`.
2. Service: `services.remove(conversationId)` in src/domain/services.ts
3. Capability: `conversations:manage` with the record-level rule (members:
   own conversations only).
4. Writes (one transaction inside `environment.run('conversations.delete')`):
   deletes the conversation's rows from `messages`, `runs` and
   `participants`, then the `conversations` row.
5. Failure states: permission denied (the action is hidden); simulated
   offline or server error (nothing deleted, an error toast, and the
   confirmation dialog stays open with "The conversation was not deleted.").

## Search messages

1. Conversation list → type two or more characters in "Search messages…".
   Results replace the list; each links to its conversation with the match
   highlighted.
2. Service: `services.search(query, limit)` in src/domain/services.ts (read
   only; the list asks for 60 and shows up to 30)
3. Capability: none in the service, which scans every message by
   case-insensitive substring. The list keeps only hits in conversations the
   active persona belongs to.
4. Writes: nothing.
5. Failure states: under 2 characters returns no results; "No messages
   match" when nothing is found. It does not go through `environment.run`, so
   it works offline.
