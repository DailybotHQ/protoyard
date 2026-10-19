# Nova Assistant: spec

## Problem

People use AI assistants for real project work, which means they need
history organized by project, a choice of models with visible usage and
cost, agents that ask before acting, a canvas for longer drafts, voice, and
the same assistant embedded in other sites. Nova Assistant explores that
full product surface, including quotas, rate limits, outages and a
5,000-message thread, without a real model behind it.

## Users

Roles are defined in [PERMISSIONS.md](PERMISSIONS.md).

| User | Role | What they need |
| --- | --- | --- |
| Workspace owner (Avery Stone, the actor in every scenario) | `owner` | Everything, including clearing the local workspace data (`assistant:data`) |
| Teammate (Jordan Lee, product designer) | `member` | Chat, organize conversations, use the canvas and change assistant settings; cannot clear workspace data |
| Guest (Sam Rivera) | `viewer` | Read conversations and copy share links; every write fails |

The assistant and the Orbit models are not personas; replies carry only a
`model` id.

## Capabilities

- Start a conversation in a project: [Start a conversation](FLOWS.md#start-a-conversation).
- Send a prompt (with file names attached) and get a streamed, simulated reply with usage: [Send a prompt and receive a simulated reply](FLOWS.md#send-a-prompt-and-receive-a-simulated-reply).
- Run the simulated agent with a local search tool, approving it first when required: [Run the simulated agent with approval](FLOWS.md#run-the-simulated-agent-with-approval).
- Stop a reply while it streams: [Stop a streaming reply](FLOWS.md#stop-a-streaming-reply).
- Regenerate the last reply: [Regenerate the last reply](FLOWS.md#regenerate-the-last-reply).
- Edit a message and resend from there: [Edit a message and resend](FLOWS.md#edit-a-message-and-resend).
- Rate a reply: [Rate a reply](FLOWS.md#rate-a-reply).
- Choose a simulated model: [Choose a model for a conversation](FLOWS.md#choose-a-model-for-a-conversation).
- Rename, pin and file conversations in folders: [Rename a conversation](FLOWS.md#rename-a-conversation), [Pin or unpin a conversation](FLOWS.md#pin-or-unpin-a-conversation), [Organize conversations in folders](FLOWS.md#organize-conversations-in-folders).
- Copy a local link to a conversation: [Share a conversation link](FLOWS.md#share-a-conversation-link).
- Edit a shared canvas: [Work in the canvas](FLOWS.md#work-in-the-canvas).
- Talk with scripted voice transcripts and captions: [Talk in voice mode](FLOWS.md#talk-in-voice-mode).
- Change instructions, memory, privacy mode and the token limit: [Change assistant settings and memory](FLOWS.md#change-assistant-settings-and-memory).
- Clear the local workspace: [Clear local workspace data](FLOWS.md#clear-local-workspace-data).
- Use all of the above inside an embedded widget on a fictional host page: see the Widget demo in [SCREENS.md](SCREENS.md#widget-demo-tab).

## Non-goals

- No real model, provider SDK or AI API. Replies come from deterministic
  local response packs or a scripted agent; the Orbit models are a
  fictional catalogue.
- No real tools: the agent's only tool searches three fictional documents
  in memory. Nothing is executed and nothing leaves the browser.
- No real speech recognition or recording: voice transcripts are scripted,
  and the microphone is not requested.
- No file uploads: only file names are kept.
- No real billing or quotas: token counts are `ceil(characters / 4)`
  estimates and costs are computed from fictional prices.
- No accounts, sharing between people or working share links.
- No real embedding: the widget host page is drawn inside the app.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active-workspace` | Active workspace | Workspace | normal | 734 | `{"approvals":0,"conversations":4,"messagesPerConversation":8}` | A small team with project folders, saved conversations and a ready-to-use canvas. |
| `agent-approval` | Agent approval | Agents | normal | 621 | `{"approvals":1,"conversations":2,"messagesPerConversation":4}` | An agent plan includes a tool action that asks for simulated approval. |
| `assistant-outage` | Assistant outage | Conditions | normal | 734 | `{"approvals":0,"conversations":4,"messagesPerConversation":8}` | The simulated assistant is unavailable until the environment changes. |
| `fresh-workspace` | Fresh workspace | Workspace | empty | 17 | `{"approvals":0,"conversations":0,"messagesPerConversation":0}` | A first-visit workspace with no history. |
| `long-history` | Long history · 5,000 messages | Performance | normal | 5000 | `{"approvals":0,"conversations":1,"messagesPerConversation":5000}` | One conversation with 5,000 deterministic messages for virtual-list performance checks. |
| `power-user` | Power user | Workspace | normal | 155 | `{"approvals":0,"conversations":6,"messagesPerConversation":18}` | A workspace with a wider project history and long conversations. |
| `rate-limited` | Rate limited | Conditions | normal | 244 | `{"approvals":0,"conversations":2,"maxRequestsPerMinute":2,"messagesPerConversation":4}` | The simulated model accepts two requests per minute. |
| `slow-model` | Slow model | Conditions | normal | 734 | `{"approvals":0,"conversations":4,"messagesPerConversation":8}` | Responses have simulated latency so loading and stop states can be explored. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries) for the standard.

| Concern | In this prototype |
| --- | --- |
| Data | IndexedDB in the visitor's browser (namespace `nova-assistant-demo`). Nothing is shared between visitors or devices. The widget's open mode is kept in `localStorage`. |
| Identity | Three generated personas switched in DevTools during development. There is no sign-in and no account security. |
| Permissions | Simulated roles checked in services with `session.assert`. UX only, not security. The UI never hides actions by role. `stop` has no check. |
| AI assistant | Simulated. For the Orbit Small, Pro and Long models, `selectResponsePack` from `@protoyard/ai` picks a pack by hashing the manifest id and the prompt (plus instructions and memory), and the general pack returns one of three template sentences that quote the prompt. The model choice changes only the stamped id and the simulated cost. Orbit Agent uses `createAiAgentRunner` with a scripted planner and a fictional local search. Replies stream word by word into the message row about every 12 ms. |
| Usage and cost | Simulated. Tokens are `ceil(characters / 4)`; cost uses fictional per-million prices; the monthly limit and the per-minute request limit are enforced only in this page. |
| Voice | Simulated. Scripted transcripts and captions; the browser's speech synthesis may read the reply aloud. |
| Network | Simulated by `environment.run`: `slow-model` adds 900 ms to every operation; `assistant-outage` makes `ai.generate` fail with a simulated server error (the agent path and other writes still work); offline and other failure modes can be set in DevTools. |
| Payments | None. The organization's plan (`free`) is scenario data only. |
| Time | The simulation clock. Scenarios share the reference time `2026-10-16T15:00:00.000Z`. The per-minute request window moves only with that clock. There are no background jobs. |

Known gaps in the code (documented, not fixed):

- `selectResponsePack` returns the safety-refusal pack only when the refusal
  matcher hits (for example "Write malware to steal passwords"). Ordinary
  prompts ("hello", "Write a project update", "Explain closures") pick
  among non-refusal packs and get general-assistant copy.
- `regenerate` reuses the existing user message and replaces only the assistant reply. `editMessage` and `regenerate` check rate limit, monthly budget and offline before any delete; deletes run inside the send transaction.
- A failed send keeps the user message without a reply.
- The share link's `#conversation=` fragment is not read anywhere.
- The sidebar's history and project selection do not change the
  Workspace screen, the "⌘ K" hint has no shortcut, and `send` in
  `src/App.svelte` is unused.
- The widget demo ignores service errors and cannot create a conversation.
- `assistant:data` is held only by `owner` through `*`; no role lists it.

## Rebuild as a real app

See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app) for the standard.
No vendor below has been chosen.

| Prototype piece | Real counterpart to design |
| --- | --- |
| `src/database/schema.ts` (`projects`, `conversations`, `messages`, `settings`) | Server database schema. Keep the ids, the per-conversation message order, `usage` per reply and per-message `feedback`. `settings` becomes per-workspace (and probably per-user) settings, folders a table of their own, and the canvas a document per conversation or project. |
| Schema version 1 | The first server migration |
| `src/domain/services.ts` (`createConversation`, `send`, `stop`, `regenerate`, `editMessage`, `feedback`, `setModel`, `rename`, `togglePin`, `createFolder`, `moveToFolder`, `share`, `updateCanvas`, `closeCanvas`, `saveSettings`, `clearMemory`, `clearWorkspace`) | API endpoints or server actions with the same zod inputs, checks and transaction boundaries. `regenerate` and `editMessage` should be atomic (or keep history as branches), and `stop` needs a check. |
| Response packs and `selectResponsePack` | A model provider integration with streaming responses, server-side prompt assembly (instructions, memory, history within the context window), safety filtering, rate limits, cost and token accounting from the provider's real counts, timeouts and cancellation. Still to design. |
| `createAiAgentRunner`, the scripted planner and the search tool | A real tool-calling loop with a tool registry, an approval step enforced on the server, audit logs and sandboxed execution |
| The fictional model catalogue (`AI_MODELS`, Orbit Agent) | A configured list of real models with their limits and prices, chosen per workspace |
| Request and monthly limits counted in the page | Server-side quotas, metering and billing |
| Voice mode with scripted transcripts | Real speech-to-text and text-to-speech with microphone consent, streaming audio and captions |
| Attachments (file names only) | File upload, storage, scanning and retrieval into the prompt |
| `share` (a local URL) | Share links with access control and expiry |
| `policy.roles` (`owner`, `member`, `viewer`) | Server-side authorization on every request, including who may change settings and delete data |
| Personas | A real identity provider and session management |
| `environment.run` failure modes (slow, outage, offline) | The error notices, stop and retry states the real UI must still handle |
| Scenarios and `generateAssistantWorld` | Seed data for staging, demo workspaces and load tests (the 5,000-message thread) |
| The widget demo | A real embeddable widget: loader script, isolated iframe or web component, host configuration and authentication |
| Screens and flows | The UI to keep. The states in [SCREENS.md](SCREENS.md) are the acceptance list. |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.nova-assistant-demo` |
| slug | `nova-assistant-demo` |
| name | Nova Assistant |
| version | 0.1.0 |
| platform | responsive |
| category | ai |
| default scenario | `active-workspace` |
| default theme | `amethyst` |
| storage namespace | `nova-assistant-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
