# AI kits

Protoyard’s AI surface is a **deterministic simulation platform** for
assistant products, agents, team chat and voice. It is designed so prototypes
feel like ChatGPT/Grok-class products, Slack-like team chat, and embeddable
chat widgets — while staying honest about what runs in the browser.

Package references: [`@protoyard/ai`](../packages/ai/README.md) (engine) and
[`@protoyard/ai-ui`](../packages/ai-ui/README.md) (Svelte UI). Measured bundle
and long-thread numbers live in [PERFORMANCE.md → AI kits](PERFORMANCE.md#ai-kits).

An optional blueprint `archetype` block selects the `assistant` or `team-chat`
experience and declares its entity slots, screen route, scenario defaults, and
the public `@protoyard/ai` / `@protoyard/ai-ui` entry points. The block is
validated data; it does not execute imports or supply callbacks. See the
[`@protoyard/blueprint` archetype contract](../packages/blueprint/README.md#the-schema).
The blueprint integration test checks the public engine and UI export targets and the
assistant's send callback contract. The current `@protoyard/ai-ui` entry exposes the
assistant workspace, not a dedicated team-chat screen; the player needs an explicit
adapter or a future team-chat UI entry for that archetype.

## Quick blueprint starters

[`blueprints/quick/assistant.json`](../blueprints/quick/assistant.json) and
[`blueprints/quick/team-chat.json`](../blueprints/quick/team-chat.json) provide
compact, fictional assistant and chat data shapes. Both declare only the
`@protoyard/ai` and `@protoyard/ai-ui` archetype entries, generated entity
relations, starter routes and deterministic scenario defaults. Assistant
content is local generated fixture text; it is not produced by a real model or
provider. The team-chat blueprint declares its archetype screen contract, while
the current UI package still needs a dedicated adapter to render that screen.

## Honest boundaries (read first)

| Claim | Reality in this repository |
| --- | --- |
| Model replies | **No real model.** Answers come from deterministic **response packs** (seed + normalized prompt hash), never from a provider SDK, API key or network completion call. |
| Speech recognition | **No real STT.** Voice “listening” advances scripted captions on the simulated clock. The engine does not call a cloud speech service. |
| Microphone | **Not requested by default.** An optional local mic **level meter** (Web Audio amplitude only) may ask for permission; audio is never recorded, stored or uploaded. |
| Speech output | Optional browser `speechSynthesis` only. If unavailable, captions stay visible and output stays muted. |
| Audio leaving the browser | **Never.** No upload path for voice or chat media in the kits. |
| Tools | Fictional local fixtures (`search`, `calendar`, `crm`, `code.run`). `code.run` reports a simulated result and **never executes** supplied code. |
| Token / cost meters | **Estimates for UI** (character heuristics and catalog prices). Not provider billing. |
| Roles and policy | Simulated UX via `session.assert` and personas. **Not security.** |
| Data | Fictional only (`.example` / `example.com`). Lives in the prototype’s IndexedDB namespace. Snapshots and markdown ASTs are untrusted input — never `{@html}`, `eval` or `new Function`. |

Every assistant surface should keep a visible “simulated” label (model chips,
bot badges, voice captions, widget copy). Dead buttons and fake success are
forbidden: stream stop, retry, outage and approval paths must do real local
work through the prototype’s services.

## Packages

| Package | Role | Entry |
| --- | --- | --- |
| `@protoyard/ai` | Engine: conversations, packs, agents, tools, suggestion/approval loop, safe markdown, scenario fixtures, voice session | `.` · `./approvals` · `./packs` · `./scenarios` · `./voice` · `./chart` · `./markdown` |
| `@protoyard/ai-ui` | Svelte 5 UI: workspace, composer, virtualized list, rich answers, canvas, voice panel, widget | `.` · `./voice` · `./widget` · `./styles.css` |

Lazy subpaths (`ai/scenarios`, `ai/voice`, `ai-ui/voice`, `ai-ui/widget`) keep
optional features out of the initial JS budget. Import styles after Tailwind
and the theme/UI sheets:

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/ai-ui/styles.css';
```

## Engine (`@protoyard/ai`)

### Conversations and streaming

```ts
import { createAiEngine } from '@protoyard/ai';

const ai = createAiEngine({
  context: {
    seed: scenario.seed,
    rng: ctx.rng,
    clock: simulatedClock,
    environment: runtime.environment,
  },
});
const chat = ai.createConversation();
const stream = ai.stream(chat.id, 'Help me plan a launch', { model: 'py-orbit-small' });
for await (const chunk of stream) render(chunk.token);
// stream.stop() or ai.stop(stream.id)
```

- Generation runs through `environment.run('ai.generate', …)` so latency,
  outage and rate-limit scenarios apply.
- Cadence and timestamps use the **injected simulated clock** (inject
  `clock.sleep` that advances time in tests).
- Supports branches, regenerate, edit-and-resend, request rate limits,
  context-window checks and estimated usage meters.
- Catalog models (`AI_MODELS`: Orbit Small / Pro / Long) are fictional;
  every entry sets `simulated: true`.

### Response packs

Packs are pure functions. Selection is stable for a given seed and normalized
prompt (`selectResponsePack`). Built-ins:

| Pack / helper | Behavior |
| --- | --- |
| `generalAssistantPack` | Templated practical answers that echo the prompt |
| `refusalPack` | Safety refusal for a small harmful-intent pattern set |
| `scriptedPack(id, responses)` | Deterministic pick from a fixed list |
| `ruleBasedPack(id, rules, fallback)` | First matching regex wins |
| `templatedPack(id, template)` | `{{prompt}}` / `{{model}}` substitution |
| `DEFAULT_RESPONSE_PACKS` | General + refusal |

Each generation gets its own RNG stream from `responseRng(seed, prompt)`.
Prototypes may add packs; bump scenario `generatorVersion` when output meaning
can change.

### Agents and tools

```ts
import { createAiAgentRunner, createDefaultAiTools, serviceAiTool } from '@protoyard/ai';

const agent = createAiAgentRunner({
  context: aiContext,
  tools: [...createDefaultAiTools(), updateNote],
  services: { 'crm.addNote': (input) => crmService.addNote(input) },
  onStep: (step) => renderAgentTimeline(step),
});
const run = agent.start('Look up this customer and add a follow-up note.');
// run.approve() / run.reject() / run.cancel(); await run.done
```

- Tools receive service functions, simulated time and a deterministic RNG —
  **not** database handles. Domain services still own policy → zod →
  `environment.run` → `db.transaction`.
- Approvals pause before tool execution; rejection returns a graceful answer;
  `cancel()` ends a running or paused run.
- Failure branches are deterministic for the same seed, run id, call order and
  tool name.

### Suggestion and approval loop

Pure detect → suggest → decide transitions with autonomy levels (1 inform · 2
suggest · 3 act with approval · 4 act within limits), area caps, audit entries
and **proposed** effects. The engine does not persist or execute; services
carry `effects` out. Default areas: `records`, `notifications`, `workspace`,
`external` (capped so external messaging always asks first). Import from
`@protoyard/ai` or `@protoyard/ai/approvals`. Complements per-tool
`requiresApproval` on the agent runner. Simulated only — label it in the UI.

```ts
import { DEFAULT_AUTONOMY, suggestFromCandidate, decideSuggestion } from '@protoyard/ai/approvals';

const transition = suggestFromCandidate(candidate, DEFAULT_AUTONOMY, {
  now: clock.now().toISOString(),
  scopeId: workspaceId,
  buildEffects: (suggestion) => ({ apply: { /* … */ }, notify: { /* … */ } }),
});
// service appends transition.audit and, after confirm/approve/auto, runs transition.effects
```

### Scenario fixtures (lazy)

```ts
import { AI_SCENARIO_FRAGMENTS, generateAiScenario } from '@protoyard/ai/scenarios';

const workspace = generateAiScenario(generateContext, AI_SCENARIO_FRAGMENTS.powerUser);
// powerUser: 8 conversations × 75 messages = 600 messages (deterministic)
```

Fragments cover fresh workspaces, long histories, slow models, rate limits,
outages, safety refusals, tool failures and approval-heavy agent plans.
Compose with `composeAiScenarioFragments(...)`. Bump
`AI_SCENARIO_GENERATOR_VERSION` when output meaning changes.

### Safe markdown

`parseMarkdown(text)` returns a plain-data AST (`MdDocument`). UI renders with
components and text nodes — **never `{@html}`**. Hostile URLs are stripped
(`safeHref` / `safeImageSrc`). Input is bounded (`MARKDOWN_MAX_LENGTH`). See
the package README for the supported subset (headings, lists, tables, code
fences, citations, attachments).

### Simulated voice (lazy)

```ts
import { createVoiceSession } from '@protoyard/ai/voice';

const voice = createVoiceSession({
  clock: aiContext.clock,
  onTranscript: (caption) => handleCaption(caption),
});
voice.start('push-to-talk');
await voice.finishListening(); // scripted caption after simulated delay
```

Modes: `push-to-talk` and `hands-free`. States: idle → listening →
transcribing → speaking (interruptible). Captions are the source of truth.

## UI (`@protoyard/ai-ui`)

### Assistant workspace

`AssistantWorkspace` takes conversation summaries and the active branch’s
messages. Send, stop, rename, pin, folder, feedback, branch, regenerate, edit
and share are **callback props** — the component does not write tables. The
parent owns streaming state and must route mutations through services.

- `MessageList` virtualizes long threads (measured heights + overscan) and
  restores scroll anchors from session storage (presentation only).
- `AssistantComposer`: Enter send, Shift+Enter newline, Escape stop, model
  picker, files, slash commands, @mentions.
- `RichAnswer` renders the markdown AST; `CanvasPanel` shows code or editable
  document text.

### Widget modes (lazy `@protoyard/ai-ui/widget`)

`AssistantWidget` cycles **launcher → sidebar → fullscreen**. The panel chunk
loads on first open. Mode is remembered per `prototypeId` in `localStorage`
when available. Escape collapses fullscreen → sidebar → launcher. Use this for
“chat bubble on a host page” demos (Nova embeds a fictional Northstar Journal
host).

### Voice panel (lazy `@protoyard/ai-ui/voice`)

`VoiceMode` wraps `createVoiceSession`, always shows captions, optionally
speaks via `speechSynthesis`, and optionally shows a local mic level meter.
Import only when the user opens voice mode so the initial chunk stays lean.

## Templates

Scaffold with `pnpm protoyard new <slug> --template <name>`.

| Template | What you get |
| --- | --- |
| `ai-assistant` | Project-scoped history, folders, model picker, canvas, agent mode, lazy voice, memory/privacy, token budget, widget-ready layout. Uses `@protoyard/ai` + `@protoyard/ai-ui`. |
| `agent-console` | Agent definitions, playground with live step trace and approvals, run history, evaluation datasets, usage dashboard. |
| `team-chat` | Slack-like workspaces, channels, threads, reactions, bots/slash commands, presence, search, files, simulated huddles (`createVoiceSession`). |
| `chat` | Two-pane conversations + one scripted streaming assistant (local `domain/assistant.ts`; no `@protoyard/ai` required). |
| `chat-widget` | Single-thread support widget for the `widget-host` shell: scripted assistant, handoff, offline banner. |

## Flagships (prototypes)

| Slug | Template lineage | Focus |
| --- | --- | --- |
| `nova-assistant-demo` | `ai-assistant` | Polished assistant product: projects, canvas, agent tools, lazy voice, widget launcher→sidebar→fullscreen, **`long-history` = 5,000 messages** for virtualization. |
| `relay-chat-demo` | `team-chat` | Relay Labs team chat: @relay / `/summarize`, threads, reactions, huddles with captions. |
| `ai-chat-demo` | earlier chat kit | Team AI chat (Atlas / Quill / Beacon agents), streamed replies, outage/retry, long threads — still a valid demo; newer work prefers Nova + Relay + kits above. |

Commands that always apply:

```bash
pnpm protoyard dev <slug>
pnpm vitest run prototypes/<slug>   # or templates/<name> when testing a template
pnpm protoyard validate <slug> --build
pnpm protoyard budget <slug>
```

## How a prototype should wire AI

1. **Persist in the prototype.** Engine and UI are ephemeral helpers. Messages,
   usage and settings live in the prototype schema and services.
2. **Mutations:** UI → service → `session.assert` → zod → `environment.run` →
   `db.transaction`. Components never write Dexie tables.
3. **Determinism:** packs and generators use `ctx.rng` / seed + prompt hash —
   never `Math.random()` or `Date.now()` for content.
4. **Label simulation** in the chrome the user sees.
5. **Lazy-load** voice, widget panel, canvas and heavy scenario fixtures.
6. **Stay under budget:** initial JS ≤ 250 KB gzip (see [PERFORMANCE.md](PERFORMANCE.md)).

## What is not in scope

- Real OpenAI / Anthropic / xAI / local-LLM providers or streaming gateways
- Real OAuth to AI vendors or billing integrations
- Cloud STT/TTS, call recording or multi-party WebRTC
- Treating simulated roles as authorization for real data
- Shipping secrets, real PII or live deploy credentials inside packs or scenarios

When a product demo needs a “connected model” story, keep the boundary in the
UI (“Simulated · no provider”) and drive behavior with packs, environment
failures and agent approvals instead of a network stub that pretends to be
live.

## Related docs

- [PERFORMANCE.md](PERFORMANCE.md) — measured AI kit bundles and long threads
- [SCENARIOS.md](SCENARIOS.md) — axes, integrity, time and environment
- [SECURITY.md](SECURITY.md) — trust boundaries; snapshots are untrusted
- [STANDARDS.md](STANDARDS.md) — TypeScript, Svelte 5, a11y
- [SHELLS.md](SHELLS.md) — `widget-host` and other device frames

## For agents

The distributable Protoyard skill routes kit choices through its `kits`
sub-skill ([`skills/protoyard/kits/SKILL.md`](../skills/protoyard/kits/SKILL.md))
and its catalog ([`skills/protoyard/references/kits.md`](../skills/protoyard/references/kits.md)),
which link back to this guide. Keep the catalog's entry for this kit in step
when its entry points or limits change.
