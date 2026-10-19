# Relay Chat: spec

## Problem

Teams that chat all day lose decisions in long channels and threads, and
switching to a call or another tool breaks the flow. Relay Chat is a
Slack-like team chat for the fictional company Relay Labs with channels,
threads, reactions, file sharing, an in-channel AI teammate (`@relay`,
`/summarize`) and huddles with always-on captions. The AI teammate and the
huddles are simulated: replies and captions are deterministic canned text.

## Users

All roles are simulated personas; see [PERMISSIONS.md](PERMISSIONS.md).

| User | Role | What they do |
| --- | --- | --- |
| Person who created the workspace | `owner` | Everything (`*`) |
| Workspace administrator | `admin` | Everything (`*`); no difference from owner today |
| Team member | `member` | Reads, posts, replies, reacts, shares files, creates channels and DMs, starts huddles, searches |
| Guest or stakeholder following along | `viewer` | Reads channels and messages and searches; every write except read markers and presence is refused |

## Capabilities

- Post in a channel and reply in threads: [Post a message](FLOWS.md#post-a-message), [Reply in a thread](FLOWS.md#reply-in-a-thread).
- Ask the simulated bots (`@relay`, `/standup`, `/ops`) and get a streamed reply: [Ask a bot teammate](FLOWS.md#ask-a-bot-teammate).
- Summarize a channel with `/summarize`: [Summarize a channel](FLOWS.md#summarize-a-channel).
- Start, talk in and leave a simulated huddle with captions: [Start a huddle](FLOWS.md#start-a-huddle), [Talk in a huddle](FLOWS.md#talk-in-a-huddle-captions), [Leave a huddle](FLOWS.md#leave-a-huddle).
- React to a message (toggle 👍): [React to a message](FLOWS.md#react-to-a-message).
- Share a demo file into a channel: [Share a file](FLOWS.md#share-a-file).
- Create a public channel: [Create a channel](FLOWS.md#create-a-channel).
- Keep read markers current by opening channels: [Mark a channel as read](FLOWS.md#mark-a-channel-as-read).
- Search messages across the workspace: [Search messages](FLOWS.md#search-messages-read-only).
- Service-only today (no UI): [Open a direct message](FLOWS.md#open-a-direct-message-service-only), [Set presence](FLOWS.md#set-presence-service-only).

## Non-goals

- No real AI: bots never call a model, and summaries do not understand the
  text; they quote one recent message.
- No real voice: no microphone, audio, speech recognition or speech
  synthesis. Huddle captions cycle through three fixed lines.
- No file content: sharing records metadata; the UI shares one fixed demo
  file and nothing can be downloaded.
- No editing or deleting messages, channels or files; no pinning, mentions
  inbox or notifications.
- No channel management: no private-channel creation in the UI, no
  invites, topics edits, archiving or member lists (`channel:manage` is
  unused).
- No unread badges, DM picker or presence picker in the UI, although
  `unreadCount`, `openDm` and `setPresence` exist as services.
- No sign-in and no multiple workspaces in the UI (the first workspace is
  used).

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `busy-day` | Busy day | Roles | normal | 104002 | — | Channels, DMs, threads, reactions and presence mid-sprint. |
| `empty` | Empty workspace | General | normal | 104001 | — | One workspace, #general only, no history. |
| `quiet-night` | Quiet night | Lifecycle | normal | 104003 | — | Member persona, lighter traffic, bots idle. |
| `viewer` | Viewer | Roles | normal | 104004 | — | Read-only stroll through the workspace. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Everything below is a simulation. See
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

| Concern | What this prototype does |
| --- | --- |
| Data | Stored in IndexedDB in the visitor's browser (namespace `relay-chat-demo`). Nothing is shared between visitors or devices: other "people" in the chat are generated rows, and there is no sync, real-time delivery or backup. |
| Identity | Personas from the scenario (fictional names). The persona is switched in DevTools, which is part of `pnpm protoyard dev` but not of the static build (`build.includeDevtools: false`). There is no sign-in and no authentication. |
| Permissions | Role capabilities checked by `session.assert` in `src/domain/services.ts`. They make forbidden calls fail even from the browser console and are not real security. Channel membership is checked for private/DM reads and all writes; public channels still need an explicit Join before posting (see [PERMISSIONS.md](PERMISSIONS.md)). |
| Payments | None. |
| AI | Scripted bots in `src/domain/bots.ts`: replies are picked from canned lines with a seeded RNG (scenario seed + prompt), and `/summarize` quotes one of the last eight messages. Replies are labeled "simulated". No model or API is called. |
| Voice | Huddles use `createVoiceSession` from `@protoyard/ai/voice` with three fixed transcripts and no wall-clock delay. No microphone or speech API is opened. |
| Network | No network calls. Most mutations run through `environment.run`, which can add latency, fail as offline or inject simulated errors from DevTools; `markRead`, `setPresence` and caption writes do not. |
| Time | A simulated clock at the scenario reference time (2026-06-01, between 09:00 and 22:00 UTC by scenario). Advancing time in DevTools applies the deterministic timeline: one presence change per day and, in `busy-day`, a ping in #general every other day. Nothing runs in the background. |
| People and content | Generated, fictional data (Relay Labs, `example.com`, `.example` file names). The generator (`src/scenarios/generators.ts`, version 1) is deterministic: the same seed and reference time produce the same world. |

## Rebuild as a real app

The hand-off for building the production version. No vendor or framework is
chosen here. See
[docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

| Prototype piece | Real counterpart to design |
| --- | --- |
| The nine tables in `src/database/schema.ts` ([DATA_MODEL.md](DATA_MODEL.md)) | Server tables with the same ids and indexes; unique constraints for the composite keys (membership, read marker, reaction, one DM per pair, one active huddle per channel); decide message retention and pagination (the prototype loads a whole channel). |
| Schema v1 | The initial server migration |
| `src/domain/services.ts` ([FLOWS.md](FLOWS.md)) | API endpoints or server actions with the same inputs. Close the gaps the prototype leaves: one transaction per flow (bot reply, file + message, huddle + presence), zod-style validation on every input, and checks that a thread parent and an attached file belong to the channel. |
| Message delivery | A real-time channel (push or subscription) so other members see messages, reactions, presence and huddles; the prototype only re-reads local IndexedDB. |
| `policy.roles` | Server-side authorization on every request, plus what the prototype lacks: channel membership checks for private channels and DMs on read, post and search, and ownership rules for ending huddles and managing channels (`channel:manage`) ([PERMISSIONS.md](PERMISSIONS.md)). |
| Personas and the DevTools persona switch | A real identity provider, sessions and workspace memberships |
| Bots in `src/domain/bots.ts` | A bot or assistant service with its own identity, rate limits and a clear AI label; summaries need real access control over which messages they read. Streaming the reply into one message row maps to a streamed or incrementally updated message. |
| Huddles and `createHuddleVoice` | A real-time audio service and a speech-to-text pipeline for captions, with consent and recording policies |
| `files` metadata | Object storage for file content, upload limits (the prototype caps at 25 MB), scanning and download links |
| Presence, read markers and the timeline | Presence from live connections with timeouts; read markers written per client; unread counts computed server-side |
| `environment.run` failures (offline, timeout, server error) | Error, retry and offline handling the real UI must have; today only the composer and new-channel form show errors |
| Scenarios and `generateTeamChatWorld` | Seed data for staging, demo workspaces and test fixtures |
| The single screen ([SCREENS.md](SCREENS.md)) | The UI to keep, plus what it still lacks: persona names instead of ids, unread badges, a DM picker and a dedicated mobile layout (reactions, membership filters, Join and read-only feedback are implemented) |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.relay-chat-demo` |
| slug | `relay-chat-demo` |
| name | Relay Chat |
| version | 0.1.0 |
| platform | responsive |
| category | ai |
| default scenario | `busy-day` |
| default theme | `ocean` |
| storage namespace | `relay-chat-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
