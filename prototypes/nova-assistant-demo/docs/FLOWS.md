# Nova Assistant: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

In this prototype the services come from `createAssistantServices(runtime)`
in `src/domain/services.ts`; `provideAssistant()` in `src/lib/context.ts`
exposes them as `services` to `src/App.svelte`, the screens and the widget
demo. Capability checks call `session.assert` (through a local `authorize`
helper). Inputs are validated with zod schemas (`promptSchema`,
`titleSchema`, `settingsSchema`, `folderSchema`, plus inline `z.enum` and
`z.string().max` checks). Errors are shown as a notice above the thread or
the form; the widget demo calls most services with `void`, so its failures
are not shown at all.

Replies are never produced by a real model: see
[Send a prompt and receive a simulated reply](#send-a-prompt-and-receive-a-simulated-reply)
and [Run the simulated agent with approval](#run-the-simulated-agent-with-approval).

## Start a conversation

1. Workspace → **New** (or **Start a conversation** in the empty state), the
   sidebar's **New conversation**, or sending a voice transcript with no
   conversation selected. The widget's new-conversation button is disabled
   (the widget demo does not pass a create handler).
2. Service: `services.createConversation(projectId?)` in src/domain/services.ts
3. Capability: `assistant:write` (no record-level rule).
4. Writes: inside `environment.run('ai.conversation.create')`, one
   `conversations` row (id `ai_chat_…`, title `New conversation`, projectId =
   the selected project or the oldest project, updatedAt from the
   simulation clock, modelId `py-orbit-small`). A single `add`, no explicit
   transaction.
5. Failure states: permission denied (viewer); "Choose a workspace project
   first." when no project exists (after **Clear local workspace data**);
   simulated offline or server error (nothing written).

## Send a prompt and receive a simulated reply

1. Workspace → type in the composer ("Message Nova…"), optionally attach
   files and pick a model, then send. The same flow runs from the widget's
   composer.
2. Service: `services.send(conversationId, prompt, model, attachments?, agentApproved?)`
   in src/domain/services.ts (it runs the internal `generateReply`)
3. Capability: `assistant:write` (no record-level rule).
4. Checks before anything is written, in this order: the prompt (zod: trimmed,
   1 to 8,000 characters); the conversation exists; the model is one of
   `py-orbit-small`, `py-orbit-pro`, `py-orbit-long` or `py-orbit-agent`;
   agent approval (see the next flow); the per-minute request limit
   (`settings.maxRequestsPerMinute`, counted in memory against the
   simulation clock, 30 by default, 2 in `rate-limited`); the monthly token
   limit (tokens of this month's messages plus the estimated prompt tokens
   must stay within `settings.monthlyLimit`).
5. Writes:
   - One transaction inside `environment.run('ai.conversation.send')`:
     `messages` (the user message: id `ai_user_…`, role `user`, content,
     createdAt, `attachments` = up to 8 file names when files were attached;
     the files themselves are never read or stored) and an empty assistant
     reply (id `ai_reply_…`, role `assistant`, same createdAt, model);
     `conversations` (updatedAt, modelId).
   - The answer. For the three Orbit models it comes from
     `environment.run('ai.generate')` around a response pack from
     `@protoyard/ai`: `selectResponsePack` picks the safety-refusal pack for
     prompts that ask for harmful instructions, otherwise it picks one of
     `DEFAULT_RESPONSE_PACKS` (general assistant or safety refusal) by a hash
     of the manifest id and the prompt. The general pack returns one of
     three templated sentences that quote the prompt, chosen by a seeded
     generator. The prompt it sees is the workspace's custom instructions,
     the saved memory (only when memory is on and data controls are
     `standard`) and the prompt. It is deterministic, never calls a model,
     and the chosen model only changes the stamped id and the simulated cost.
   - Streaming: the answer is split into words; each word updates
     `messages.content` (about every 12 ms, not in a transaction).
   - Then one transaction (not inside `environment.run`) sets the reply's
     `content` and `usage` (promptTokens, completionTokens = ceil(characters /
     4), totalTokens, costUsd from the model's per-million prices) and
     `conversations.updatedAt`.
   - When the prompt contains "draft", "write", "code", "plan" or "canvas",
     `settings.canvas` is set to the reply (title = the prompt, cut to 36
     characters; kind `code` when the prompt mentions code, TypeScript or a
     function, otherwise `document`). This write is not inside
     `environment.run`.
6. Failure states: permission denied (viewer: the composer stays visible
   and the notice shows the error); empty or too long prompt; "Choose a
   supported simulated model."; the request limit ("The simulated model
   request limit was reached…"); the monthly limit, before sending or after
   streaming ("This reply would exceed the simulated monthly token
   limit…"); simulated offline or server error on `ai.conversation.send`
   (nothing written). When anything fails after the first transaction (for
   example `ai.generate` in `assistant-outage`), the reply row is deleted
   but **the user message stays**. A request that fails still counts
   toward the per-minute limit.

## Run the simulated agent with approval

1. Workspace or widget → choose **Orbit Agent** (`py-orbit-agent`) in the
   model picker and send. When the workspace requires approval (the
   `agent-approval` scenario sets `settings.agentApprovalRequired`), a
   browser confirm dialog asks to approve the simulated tool run first;
   declining shows "The simulated agent run was not approved." in the
   workspace (the widget returns silently).
2. Service: `services.send(conversationId, prompt, model, attachments, agentApproved)`
   in src/domain/services.ts
3. Capability: `assistant:write` (no record-level rule).
4. Writes: the same rows as the previous flow. The answer comes from
   `createAiAgentRunner` in `@protoyard/ai` instead of a response pack: a
   scripted planner adds one `search` tool call when the prompt mentions
   search, find, research, launch or customer; the tool runs through
   `environment.run('ai.agent.tool.search')` and matches the prompt's words
   against three fictional documents (Launch checklist, Customer onboarding
   guide, Incident response notes). The answer lists the matches ("I ran a
   simulated local search for …") or gives a fixed planning sentence. Tool
   calls are not stored; only the final text is.
5. Failure states: "This scenario requires approval before the simulated
   agent can run." when approval is required and not given (thrown before
   anything is written); plus the failure states of the previous flow. The
   agent path does not call `ai.generate`, so `assistant-outage` does not
   affect it. App's `sendVoiceTranscript` passes `true` when no approval
   is needed.

## Stop a streaming reply

1. Workspace or widget → the composer's stop button ("Stop response")
   while a reply streams.
2. Service: `services.stop(conversationId)` in src/domain/services.ts
3. Capability: none. `stop` is synchronous, has no `session.assert` and does
   not go through `environment.run`.
4. Writes: nothing directly. The stream loop stops before its next word; the
   reply keeps the text streamed so far, and the final transaction records
   usage for only the emitted words (`messages.content`, `messages.usage`,
   `conversations.updatedAt`).
5. Failure states: none; a conversation with no active stream is ignored.
   Streams live in memory, so a reload mid-stream leaves a partial reply
   with no `usage`.

## Regenerate the last reply

1. Workspace or widget → **Regenerate** on the latest assistant reply
   (disabled while streaming).
2. Service: `services.regenerate(conversationId)` in src/domain/services.ts
3. Capability: `assistant:write` (no record-level rule).
4. Writes: deletes the last assistant message from `messages` (directly, not
   inside `environment.run`), then sends the preceding user message again
   with the conversation's model, exactly as in
   [Send a prompt and receive a simulated reply](#send-a-prompt-and-receive-a-simulated-reply).
   That send adds a **new user message** with the same text, so the
   thread ends up with the prompt twice. Agent approval is never passed, so
   regenerating with Orbit Agent fails when approval is required.
5. Failure states: permission denied; "No user message is available to
   regenerate."; every failure of the send flow, after the old reply is
   already deleted.

## Edit a message and resend

1. Workspace or widget → **Edit** on one of your messages → change the text
   → **Save and resend**.
2. Service: `services.editMessage(conversationId, messageId, content, model)`
   in src/domain/services.ts (the workspace passes the conversation's model)
3. Capability: `assistant:write` (no record-level rule).
4. Writes: validates the new text with `promptSchema`, then deletes from
   `messages` every message of the conversation created at or after the
   edited one (directly, not inside `environment.run` or a transaction),
   then sends the new text as in
   [Send a prompt and receive a simulated reply](#send-a-prompt-and-receive-a-simulated-reply).
5. Failure states: permission denied; "Choose a user message in this
   conversation."; an invalid prompt; every failure of the send flow, after
   the later messages are already deleted (they are not restored).

## Rate a reply

1. Workspace or widget → thumbs up ("Helpful response") or down ("Unhelpful
   response") on an assistant reply.
2. Service: `services.feedback(messageId, rating)` in src/domain/services.ts
3. Capability: `assistant:write` (no record-level rule).
4. Writes: `messages.feedback` (`up` or `down`), inside
   `environment.run('ai.feedback')`.
5. Failure states: permission denied; an invalid rating (zod); "Feedback is
   only available on assistant replies."; simulated offline or server
   error.

## Choose a model for a conversation

1. Workspace → the composer's model picker (Orbit Small, Orbit Pro, Orbit
   Long, Orbit Agent; all marked simulated). In the widget the picker only
   changes the model for the next send, which then stamps it on the
   conversation; it does not call this service.
2. Service: `services.setModel(conversationId, modelId)` in src/domain/services.ts
3. Capability: `assistant:write`. The conversation is passed to
   `session.assert`, but there are no record-level rules.
4. Writes: `conversations.modelId`, inside `environment.run('ai.model.select')`.
   Sending also stamps the model used on `conversations.modelId`.
5. Failure states: "This conversation no longer exists." (checked before the
   capability); permission denied; "Choose a supported simulated model.";
   simulated offline or server error.

## Rename a conversation

1. Workspace → **Rename** in the thread header → browser prompt, or the
   widget's conversation actions → edit the title → save.
2. Service: `services.rename(conversationId, title)` in src/domain/services.ts
3. Capability: `assistant:write` (conversation passed, no rules).
4. Writes: `conversations.title` (zod: trimmed, 2 to 80 characters), inside
   `environment.run('ai.conversation.rename')`. Cancelling the workspace's
   prompt saves the current title again.
5. Failure states: missing conversation; permission denied; a title too
   short or too long; simulated offline or server error.

## Pin or unpin a conversation

1. Workspace → **Pin** in the thread header, or the widget's conversation
   actions. Pinned conversations show a ★ in history lists.
2. Service: `services.togglePin(conversationId)` in src/domain/services.ts
3. Capability: `assistant:write` (conversation passed, no rules).
4. Writes: `conversations.pinned` (flipped), inside
   `environment.run('ai.conversation.pin')`. The workspace's history lists
   stay sorted by `updatedAt` (newest first), not by pin.
5. Failure states: missing conversation; permission denied; simulated
   offline or server error.

## Organize conversations in folders

1. Workspace → history panel → "New folder" → **+**; then the folder select
   in the thread header ("No folder" removes it). Folder buttons in the
   history panel filter the list. The widget has the same actions.
2. Services: `services.createFolder(name)` and
   `services.moveToFolder(conversationId, folder)` in src/domain/services.ts
3. Capability: `assistant:write` for both (no rules).
4. Writes: `createFolder` appends the trimmed name (zod: 1 to 40 characters)
   to `settings.folders` and sets `settings.updatedAt`, inside
   `environment.run('ai.folder.create')`; an existing name is ignored.
   `moveToFolder` sets `conversations.folder` (or clears it with `null`),
   inside `environment.run('ai.conversation.folder')`. Folders cannot be
   renamed or deleted.
5. Failure states: permission denied; an empty name; "Create this folder
   before moving a conversation into it."; missing conversation; simulated
   offline or server error.

## Share a conversation link

1. Workspace → **Share** in the thread header (copies the link), or the
   widget's "Create share link".
2. Service: `services.share(conversationId)` in src/domain/services.ts (read
   only)
3. Capability: `assistant:read`.
4. Writes: nothing. It returns the current page URL with
   `#conversation=<id>`. The link only works in this browser, and no code
   reads the `#conversation=` fragment today.
5. Failure states: missing conversation; "Clipboard access is unavailable;
   the local link was not copied." in the workspace. Not routed through
   `environment.run`, so it works offline.

## Work in the canvas

1. Workspace → **Canvas** in the thread header opens the canvas dialog
   (loaded on demand). When no canvas exists yet, it is created with a
   starter text. Editing the text saves it; closing the dialog only hides
   it. A reply to a prompt about drafting, writing, code, a plan or the
   canvas also fills the canvas (see the send flow). The widget shows the
   same canvas with a close action that removes it.
2. Services: `services.updateCanvas(content)` and `services.closeCanvas()` in
   src/domain/services.ts
3. Capability: `assistant:write` for both (no rules).
4. Writes: `updateCanvas` sets `settings.canvas` to `{ title: 'Working
   canvas', content, kind: 'document' }` (zod: at most 20,000 characters)
   and `settings.updatedAt`, inside `environment.run('ai.canvas.update')`;
   `closeCanvas` sets `settings.canvas` to `null`, inside
   `environment.run('ai.canvas.close')`. There is one canvas per workspace,
   not per conversation.
5. Failure states: permission denied (a viewer opening an empty canvas gets
   no dialog); too long; simulated offline or server error.

## Talk in voice mode

1. Header → **Voice** loads voice mode on demand. Push to talk (or hands-free)
   produces a **scripted transcript** ("Summarize the latest project
   update.", "What should I focus on next?", "Draft a short response for
   the team.") shown as a caption; the transcript is sent to the active
   conversation (one is created when none is selected). The latest
   assistant reply is shown as a caption and spoken with the browser's
   speech synthesis when available.
2. Service: `services.send(conversationId, prompt, model, [], approved)` (and
   `services.createConversation` when needed) in src/domain/services.ts
3. Capability: `assistant:write`.
4. Writes: as in [Send a prompt and receive a simulated reply](#send-a-prompt-and-receive-a-simulated-reply).
   No audio is recorded or stored; the microphone is not requested (the
   level meter is off).
5. Failure states: every failure of the send flow, shown in the alert
   above the content. With Orbit Agent and approval required, a confirm
   dialog asks first; declining sends nothing.

## Change assistant settings and memory

1. Sidebar or header → **Settings** (`#/settings`) → edit custom
   instructions, memory (on/off and text), context mode (`standard` or
   `private`) and the monthly token limit → **Save settings**; or **Clear
   saved memory**.
2. Services: `services.saveSettings({ customInstructions, memory, memoryEnabled, dataControls, monthlyLimit })`
   and `services.clearMemory()` in src/domain/services.ts
3. Capability: `assistant:settings` (owner and member; no rules).
4. Writes: `saveSettings` validates with `settingsSchema` (instructions and
   memory at most 1,200 characters each, monthlyLimit an integer from 1,000
   to 10,000,000) and updates those five fields plus `updatedAt`, inside
   `environment.run('ai.settings.update')`. `clearMemory` sets
   `settings.memory` to `''` and `updatedAt`, inside
   `environment.run('ai.memory.clear')`. The new values apply to the next
   reply's prompt.
5. Failure states: permission denied (viewer: the form is shown and the
   error appears on save); zod errors (shown as the raw validation
   message); simulated offline or server error.

## Clear local workspace data

1. Settings → **Clear local workspace data** → confirm.
2. Service: `services.clearWorkspace()` in src/domain/services.ts
3. Capability: `assistant:data`, held only by `owner` (through `*`).
4. Writes: one transaction inside `environment.run('ai.data.clear')` that
   clears `messages`, `conversations` and `projects`. `settings` (folders,
   memory, canvas) is kept. Afterwards no conversation can be created
   until a scenario is loaded again, because no project exists.
5. Failure states: permission denied (member, viewer); simulated offline or
   server error (nothing cleared).
