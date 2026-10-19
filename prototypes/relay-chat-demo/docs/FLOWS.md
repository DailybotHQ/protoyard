# Relay Chat: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

All services are created by `createTeamChatServices(runtime)` in
src/domain/services.ts; below they are written as `services.<method>`.

Common failure behavior: write handlers catch errors and show them above
the composer (`role="alert"`). Roles without a write capability see disabled
controls with a tooltip and a short toast ("Read-only role…"). Membership
errors ("Join this channel before posting") use the same alert path.

Mutations run UI → service → `session.assert` → zod (where defined) →
`environment.run` → `db.transaction`. Public-channel **Join** is
`joinChannel`; reactions are listed via `listReactionSummaries` and shown
as chips with counts.

## Post a message

1. Pick a channel in the sidebar, type in the composer ("Message composer")
   and press Enter or "Send". On success the draft clears and the message
   appears in the log.
2. Service: `services.sendMessage(channelId, { body, threadId: null })` in src/domain/services.ts
3. Capability: `message:create` (owner, admin, member). No record-level rule.
4. Writes: membership is required first (public channels: Join). One
   transaction over `messages` (new row), `channels` (lastMessageAt) and
   `reads` (author marker). Bot replies stream in the same transaction.
5. Failure states: permission denied, "Join this channel before posting",
   validation ("Write a message"), "Channel not found", simulated offline.

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
4. Writes: one transaction on `reactions` (upsert or delete by
   `messageId:personaId:emoji`). Membership on the message's channel is
   required. The UI lists chips via `listReactionSummaries` (count + mine).
5. Failure states: permission denied, "Join this channel before posting",
   "Pick an emoji", "Message not found", simulated offline — shown above the
   composer or as a read-only toast.

## Share a file

1. Header → "Share file". The button always shares the same demo file,
   `notes.example.txt` (1,024 bytes, `text/plain`); there is no file picker.
   A "Shared notes.example.txt" message with "Attachment id …" appears.
2. Service: `services.shareFile(channelId, { name, sizeBytes, mimeType })` in src/domain/services.ts
3. Capability: `file:share` (owner, admin, member)
4. Writes: one transaction over `files`, `messages`, `channels` and
   `reads` after membership is checked.
5. Failure states: permission denied, membership, validation, simulated
   offline — shown above the composer.

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
   contains the query (case-insensitive) in **accessible** channels only
   (every public channel plus private channels and DMs the actor belongs to).
   Queries shorter than 2 characters return nothing.
5. Failure states: permission denied (alert). Zero hits show nothing
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
