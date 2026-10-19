# Relay Chat: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

All services are created by `createTeamChatServices(runtime)` in
src/domain/services.ts; below they are written as `services.<method>`.

Common failure behavior (current code): only two UI handlers catch errors,
`send()` (the composer) and `createChannel()` (the "+ New" form). They show
the error message as red text above the composer (`role="alert"`), for
example `Permission denied: role "viewer" lacks "message:create".
(Simulated policy — not real security.)` or the simulated offline message.
The other handlers (React, Share file, Huddle, Search, Leave) do not catch:
a denial or a simulated failure becomes an unhandled promise rejection and
nothing is shown on screen. Buttons are never hidden or disabled by role.

Pipeline deviations are named in each flow. In short: `sendMessage`,
`shareFile`, `startHuddle` and `endHuddle` write some rows outside a
`db.transaction`; `markRead` and `setPresence` skip `environment.run`; only
`createChannel` and `sendMessage` validate with zod (the others check by
hand).

## Post a message

1. Pick a channel in the sidebar, type in the composer ("Message composer")
   and press Enter or "Send". On success the draft clears and the message
   appears in the log.
2. Service: `services.sendMessage(channelId, { body, threadId: null })` in src/domain/services.ts
3. Capability: `message:create` (owner, admin, member). No record-level rule.
4. Writes: `channelMembers` (the actor is added as `member` of the channel
   if not already, outside the transaction, even for a private channel or a
   DM), then one transaction over `messages` (new row: id, channelId,
   authorId = acting persona, authorKind `person`, body (trimmed), at,
   threadId `null`, fileId `null`), `channels` (lastMessageAt) and `reads`
   (the author's marker, lastReadAt = at).
5. Failure states: permission denied, validation ("Write a message" for an
   empty body, at most 4,000 characters), "Channel not found", simulated
   offline or failure (nothing written). Validation and the channel check run
   before `environment.run`.

## Reply in a thread

1. On a top-level message → "Reply in thread". A "Thread" bar with "Close"
   appears, the log switches to the replies of that message (the parent is
   not shown), and the composer placeholder becomes "Reply in thread…".
   Type and send. "Close" returns to the channel.
2. Service: `services.sendMessage(channelId, { body, threadId })` in src/domain/services.ts
3. Capability: `message:create` (owner, admin, member)
4. Writes: the same as [Post a message](#post-a-message), with `threadId` =
   the parent message id. The service does not check that the parent exists
   or belongs to the channel.
5. Failure states: the same as posting.

## Ask a bot teammate

1. In the composer, mention or command a bot: `@relay …` or `/relay …`
   (Relay), `@standup` or `/standup` (Standup Bot), `@ops` or `/ops` (Ops
   Scout). The sidebar "Bots" list names the handles; the footer lists the
   slash commands. The person's message appears, then the bot reply streams
   into the log word by word with an "AI · simulated" badge.
2. Service: `services.sendMessage(channelId, { body, threadId })` in src/domain/services.ts
   (`matchBot` picks the bot; `botReply(botId, body, seed)` in
   src/domain/bots.ts picks one of the bot's canned lines, deterministically
   from the scenario seed and the lowercased prompt)
3. Capability: `message:create` (owner, admin, member)
4. Writes: everything in [Post a message](#post-a-message), then, outside any
   transaction: `messages` (a bot row: authorId `bot_relay`, `bot_standup` or
   `bot_ops`, authorKind `bot`, threadId = the person's threadId, fileId
   `null`; written once empty and then once per whitespace-split chunk as
   the body grows) and `channels` (lastMessageAt = the bot row's `at`). The
   bot's read marker is not written.
5. Failure states: the same as posting. A failure part-way through the
   streaming loop would leave a partial bot row, because those writes are
   not in a transaction.

## Summarize a channel

1. Send `/summarize` or `@relay summarize`. Any other message that summons
   a bot and contains "summarize" also gets the summary, authored by
   whichever bot matched (for example `@ops summarize` is answered by Ops
   Scout).
2. Service: `services.sendMessage(channelId, { body: '/summarize' })` in src/domain/services.ts
   (`summarizeChannel(bodies, seed)` in src/domain/bots.ts)
3. Capability: `message:create` (owner, admin, member)
4. Writes: as in [Ask a bot teammate](#ask-a-bot-teammate). The Relay reply
   is "Relay summary (simulated): N recent notes. Theme: “…”. Next step looks
   like unblock the demo path." built from the last eight person-authored
   bodies in the channel (thread replies included, the `/summarize` message
   itself excluded), or "this channel is quiet" when there are none.
5. Failure states: the same as posting.

## Start a huddle

1. Header → "Huddle" (aria-label "Start huddle"), or send `/huddle` in the
   composer. The "Huddle (simulated)" panel opens above the composer.
2. Service: `services.startHuddle(channelId)` in src/domain/services.ts (the
   button); `services.sendMessage(channelId, { body: '/huddle…' })` for the
   command, which calls the same internal function and then posts "Started a
   simulated huddle" as the person's message (in the open thread, if any).
3. Capability: `huddle:start` (owner, admin, member). The `/huddle` path
   also needs `message:create`.
4. Writes (no transaction, no zod): if the channel already has a huddle with
   no `endedAt`, nothing is written and that huddle is returned. Otherwise
   `huddles` (new row: id, channelId, startedBy = acting persona, startedAt,
   endedAt `null`, captions `''`) and `presence` (the actor's row: status
   `in-huddle`, statusText "In a simulated huddle", updatedAt). The `/huddle`
   path also writes everything in [Post a message](#post-a-message).
5. Failure states: permission denied, simulated offline or failure (nothing
   written). From the button these errors are not shown on screen; from the
   composer they are. The `/huddle` path runs `environment.run('huddle.start')`
   nested inside `environment.run('message.send')`, so a simulated failure
   can be injected at either level.

## Talk in a huddle (captions)

1. In the huddle panel, press and hold "Hold to talk", then release. The
   panel's phase label shows the voice state, and a line "You: …" is added to
   the captions box.
2. Service: `services.createHuddleVoice(huddleId)` in src/domain/services.ts
   (called once when the panel mounts; the panel then calls
   `voice.start('push-to-talk')` and `voice.finishListening()` from
   `@protoyard/ai/voice`)
3. Capability: `huddle:start` (checked once, when the voice session is
   created)
4. Writes (from the `onTranscript` callback, no `environment.run`, no
   transaction): `huddles` (captions: appends the line
   `<personaId>: <transcript>`; skipped when the huddle has ended). The
   transcripts cycle through three fixed lines ("Can everyone hear the demo
   captions?", "Ship checklist looks good on my side.", "Let us park the
   remaining items for tomorrow."). No microphone, audio or speech API is
   used.
5. Failure states: none surfaced. The panel shows its own local caption
   text and does not read `huddles.captions` back.

## Leave a huddle

1. Huddle panel → "Leave". The panel closes immediately.
2. Service: `services.endHuddle(huddleId)` in src/domain/services.ts
3. Capability: `huddle:start` (owner, admin, member). Any holder can end any
   huddle; there is no check that the actor started or joined it.
4. Writes (no transaction): `huddles` (endedAt) and `presence` (the actor's
   row: status `online`, statusText `''`, updatedAt). An unknown or already
   ended huddle writes nothing.
5. Failure states: permission denied, simulated offline or failure (nothing
   written), none of them shown: the panel closes either way.

## React to a message

1. On any message → "👍 React". Clicking again removes the reaction.
2. Service: `services.toggleReaction(messageId, '👍')` in src/domain/services.ts
3. Capability: `message:react` (owner, admin, member)
4. Writes (single write, no zod): `reactions` (a row with id
   `messageId:personaId:emoji`, emoji, personaId, at is added, or the
   existing row with that id is deleted).
5. Failure states: permission denied, "Pick an emoji" (empty emoji after
   trimming; the emoji is cut to 16 characters), "Message not found",
   simulated offline or failure. None of them are shown on screen. Note that
   the screen does not display reactions at all today, so a successful toggle
   has no visible effect either.

## Share a file

1. Header → "Share file". The button always shares the same demo file,
   `notes.example.txt` (1,024 bytes, `text/plain`); there is no file picker.
   A "Shared notes.example.txt" message with "Attachment id …" appears.
2. Service: `services.shareFile(channelId, { name, sizeBytes, mimeType })` in src/domain/services.ts
3. Capability: `file:share` (owner, admin, member)
4. Writes: `files` (new row: id, channelId, name (trimmed), sizeBytes
   (floored), mimeType (default `application/octet-stream`), uploadedBy =
   acting persona, at), then, in a separate transaction, `messages` (body
   "Shared <name>", fileId), `channels` (lastMessageAt) and `reads` (the
   actor's marker). The `files` write is not in that transaction.
5. Failure states: permission denied, "File name is required", "File size
   must be under 25 MB" (negative, non-finite or above 25,000,000), simulated
   offline or failure. None are shown on screen.

## Create a channel

1. Sidebar → "+ New" → type a name → "Add". On success the form closes and
   the new channel opens.
2. Service: `services.createChannel(workspaceId, { name })` in src/domain/services.ts
3. Capability: `channel:create` (owner, admin, member)
4. Writes (one transaction): `channels` (new row: id, workspaceId, kind
   (default `public`; the UI never sends `private`), name, topic (default
   `''`), createdBy = acting persona, createdAt, dmKey `null`,
   lastMessageAt = createdAt), `channelMembers` (the creator, role `owner`).
5. Failure states: permission denied, validation ("Name must have at least
   2 characters", at most 40, "Use lowercase letters, numbers and dashes";
   topic at most 120), simulated offline or failure (nothing written). The
   `workspaceId` is not checked, and duplicate names are allowed.

## Mark a channel as read

1. Automatic: whenever the selected channel changes (including the first
   one selected on load), the screen marks it read.
2. Service: `services.markRead(channelId)` in src/domain/services.ts
3. Capability: `message:read` (every role)
4. Writes (single write; no zod, no `environment.run`, so it succeeds even
   in simulated offline mode): `reads` (the actor's marker for the channel:
   lastReadAt = simulated now).
5. Failure states: permission denied (not shown). The screen does not show
   unread counts; `services.unreadCount(channelId)` exists (counts messages
   after the marker not written by the actor, thread replies included) but no
   screen calls it.

## Open a direct message (service only)

1. No UI today. Callable from code or tests.
2. Service: `services.openDm(workspaceId, otherPersonaId)` in src/domain/services.ts
3. Capability: `channel:create` (owner, admin, member)
4. Writes (one transaction, only when no channel with the same `dmKey`
   exists; otherwise that channel is returned): `channels` (kind `dm`, name =
   the other persona's name, topic "Direct message", dmKey = the two persona
   ids sorted and joined with `:`), `channelMembers` (both personas, role
   `member`).
5. Failure states: permission denied, "Pick someone else for a DM", "Person
   not found" (checked against `py_personas` before `environment.run`),
   simulated offline or failure. The DM is named after the other persona
   from the creator's point of view, so the other participant sees it named
   after themselves.

## Set presence (service only)

1. No UI today. Presence is otherwise changed by huddles and by the timeline
   (below).
2. Service: `services.setPresence(status, statusText)` in src/domain/services.ts
3. Capability: `workspace:read` (every role, so a viewer can set it)
4. Writes (single write; no zod, no `environment.run`): `presence` (the
   actor's row: status, statusText trimmed to 80 characters, updatedAt).
   `status` is not validated at runtime.
5. Failure states: permission denied.

## Search messages (read-only)

1. Header → type in "Search…" → Enter or "Search". With hits, a "Search
   results" panel lists "N result(s)" and the first 80 characters of each;
   clicking one opens its channel (and its thread, for a reply) and closes
   the panel.
2. Service: `services.search(workspaceId, query)` in src/domain/services.ts
3. Capability: `search:run` (every role)
4. Writes: none. Returns up to 50 messages, newest first, whose body
   contains the query (case-insensitive) in any channel of the workspace.
   Queries shorter than 2 characters return nothing. Private channels and
   DMs the actor is not a member of are not filtered out.
5. Failure states: permission denied (not shown). Zero hits show nothing
   (no "no results" message), and an earlier result panel is not cleared
   when a later search finds nothing.

## Timeline events (simulated time)

Not a user flow and not a service: advancing time in DevTools runs
`teamChatTimeline` and `applyTeamChatEvent` in src/scenarios/timeline.ts.

- Every simulated day, one persona (chosen by day index) gets a
  `presence.tick`: `presence` (status `online`, `away` or `offline` by day
  index; statusText "In a fictional meeting" when away).
- In `busy-day` only, on even days, a `message.incoming` event posts
  "Timeline ping #<day>: standup notes are in #general (simulated)." to
  #general: `messages` (a person row) and `channels` (lastMessageAt).
