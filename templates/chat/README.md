# Chat

A Protoyard chat starter. You get persisted **conversations and messages**, plus one scripted
**assistant**. Its replies are deterministic (no AI API) and stream in chunk by chunk, saved
into the message as they arrive. You can stop a reply or retry it, and simulated outages make
it fail. The starter also includes unread badges, a composer, an empty state, a two-pane
layout on wide screens and a single pane on phones, owner/member/viewer personas, and four
scenarios. Built to be extended.

```bash
pnpm protoyard new my-chat --template chat   # create a prototype from this template
pnpm protoyard dev my-chat                   # run it
pnpm vitest run prototypes/my-chat           # tests
pnpm --filter @prototype/my-chat typecheck
```

## What's inside

```text
src/
├── App.svelte                  hash router + responsive two-pane / one-pane shell
├── prototype.ts                definePrototype: manifest + schema + policy + scenarios + generator
├── database/schema.ts          conversations · messages · reads (per-person read markers)
├── domain/assistant.ts         the scripted assistant: scriptedReply() + chunkReply()
├── domain/chat.ts              services: send, stream, cancel, retry, markRead, unreadCount, rename, remove
├── domain/policy.ts            owner: everything · member: chat + manage own · viewer: read
├── scenarios/index.ts          empty · active · viewer · assistant-outage
├── scenarios/generators.ts     deterministic world (seeded rng, fixed reference time)
├── lib/context.ts              provideChat()/useChat(): runtime, db, services, live inbox + people
├── components/                 ConversationList, MessageList, ConversationMenu, NewConversationDialog,
│                               ConditionBanner, Avatar
└── screens/                    Home (welcome / pick one), Thread (messages + composer)
```

- **Streaming:** `send()` saves your message first, then creates an assistant message with
  status `streaming` and writes each chunk into it. The screens read with `liveQuery`, so the
  reply grows on screen with no extra code. A reload mid-stream keeps what had arrived. The
  message is then marked "interrupted" and can be retried.
- **Failures:** the "model call" is the environment operation `assistant.reply`. The
  `assistant-outage` scenario sets `failureScope: ['assistant.']`, so only replies fail. The
  failed message shows the error and a **Retry** button. Offline sends fail with a toast and
  keep your draft.
- **Unread:** `reads` stores one `lastReadAt` per person per conversation. Opening a thread
  calls `markRead`, and the list shows `unreadCount` for the active persona.
- **Permissions:** the UI hides what a role can't do (`can(...)`), and the services also call
  `session.assert(...)`, so bypassing the UI still fails. Viewers see a read-only banner and a
  disabled composer.
- **Layout:** container queries (`@3xl:`) rather than media queries, so DevTools phone presets
  get the real one-pane layout with a back button.
- **Accessibility:** controls are labelled. Enter sends and Shift+Enter adds a new line. The
  thread follows new messages only while you are at the bottom, and each finished reply is
  announced once through a polite live region.

## Extend it

**Add a table**

1. In `src/database/schema.ts`, add a type and a **new** version. Never edit a version that
   has shipped:
   ```ts
   versions: [
     { version: 1, stores: { conversations: '…', messages: '…', reads: '…' } },
     { version: 2, stores: { reactions: 'id, messageId, personaId' } },
   ]
   ```
2. Bump `storage.schemaVersion` in `protoyard.json` to `2`.
3. Add `reactions: EntityTable<Reaction, 'id'>` to `ChatDatabase`.
4. Generate rows in `scenarios/generators.ts` (`tables: { …, reactions }`), and declare
   foreign keys in `prototype.ts` → `integrity.relations` so a broken generator fails loudly.

**Add a service:** add a method to `createChatServices` and keep the four steps
(`session.assert` → validate → `environment.run` → Dexie write). Throw `ChatValidationError`
with an `issues` object for field errors; forms read them from `runService`'s result. To give
the assistant more to say, add topics to `domain/assistant.ts`. Replies stay pure functions of
the prompt.

**Add a screen:** create `src/screens/Thing.svelte`, then register `{ path: '/things/:id',
component: Thing }` in `App.svelte`. Read data with `liveQuery(() => db…, { deps: () => id })`.
Dexie runs queriers outside Svelte's tracking, so route params and filters belong in `deps`.

**Add a scenario:** append it to `scenarios/index.ts` **and** list its id in
`protoyard.json` → `scenarios`. Use `environment` for conditions (offline, latency, failure
modes and scopes) and `generators.conversations` for density. Seeds and `referenceTime` make
every world reproducible. Bump `generatorVersion` in `prototype.ts` when the same seed starts
producing different data.

**Add a role:** add it to `domain/policy.ts` (and `ROLE_LABELS`), then give a persona that
membership role in the generator.

## Limits

The thread renders every message. That suits starter-sized data. For very long threads, render
only the newest page and add a "Load earlier" button: see `prototypes/ai-chat-demo` for a
worked version, which also has @mentions, several agents, search and archiving.
