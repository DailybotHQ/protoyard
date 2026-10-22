# @protoyard/ai

Framework-agnostic deterministic simulated AI conversations. Every catalog entry and response is fictional; the package never calls a model provider or uses credentials.

**Platform guide:** [docs/AI_KITS.md](../../docs/AI_KITS.md) (engine, packs, agents, voice, templates, flagships, honest boundaries). **Measured bundles and long threads:** [docs/PERFORMANCE.md → AI kits](../../docs/PERFORMANCE.md#ai-kits).

```ts
import { createAiEngine } from '@protoyard/ai';

const ai = createAiEngine({
  context: { seed: scenario.seed, rng: ctx.rng, clock: simulatedClock, environment: runtime.environment },
});
const chat = ai.createConversation();
const stream = ai.stream(chat.id, 'Help me plan a launch', { model: 'py-orbit-small' });
for await (const chunk of stream) render(chunk.token);
// stream.stop() or ai.stop(stream.id) stops generation.
```

The response pack is selected from the seed and normalized prompt hash, then receives its own deterministic RNG stream. Scripted, regex rule-based and templated packs can be supplied. The default catalog includes a general assistant and a safety refusal pack. Environment simulation is applied to each generation through `environment.run('ai.generate', ...)`; token cadence and timestamps use the injected simulated clock. Inject `clock.sleep` that advances your simulated clock in tests.

The engine supports conversation branches, regenerate, edit-and-resend, request rate limits, model context-window checks, and estimated token/cost meters. Usage values are estimates for prototype UI, not provider billing. The generated content is simulated and should be labeled as such in the consuming interface.

## Agent runs and tools

```ts
import { createAiAgentRunner, createDefaultAiTools, serviceAiTool } from '@protoyard/ai';

const updateNote = serviceAiTool({
  name: 'crm.note',
  description: 'Add a note to the current customer.',
  service: 'crm.addNote', // resolved from injected domain services
  requiresApproval: true,
});
const agent = createAiAgentRunner({
  context: aiContext,
  tools: [...createDefaultAiTools(), updateNote],
  services: { 'crm.addNote': (input) => crmService.addNote(input) },
  onStep: (step) => renderAgentTimeline(step),
});
const run = agent.start('Look up this customer and add a follow-up note.');
// run.steps is also available as a live timeline snapshot.
// In the approval UI, call run.approve(), run.reject(), or run.cancel().
const result = await run.done;
```

Tools receive service functions, simulated time and a deterministic random stream. They do not receive database handles. Implement service-backed reads and writes through `serviceAiTool`; the domain service remains responsible for policy, validation, environment simulation and transactions. Approvals pause a run before the tool executes. A rejection returns a graceful answer, while `cancel()` ends a running or paused run. Tool failure branches are deterministic for the same seed, run id, call order and tool name. The built-in search, calendar, and CRM tools use fictional local fixtures; `code.run` reports a simulated result and never executes supplied code.

## AI scenario fixtures

Import scenario generation from the lazy subpath so its fixture generator is not part of the base AI entrypoint:

```ts
import { AI_SCENARIO_FRAGMENTS, generateAiScenario } from '@protoyard/ai/scenarios';

const workspace = generateAiScenario(generateContext, AI_SCENARIO_FRAGMENTS.powerUser);
// workspace contains a deterministic 600-message history.
```

Fragments cover fresh workspaces, long histories, slow models, rate limits, model outages, safety refusals, tool failures, and approval-heavy agent plans. Compose fragments with `composeAiScenarioFragments(...)` before passing them to the generator. The output includes fixture conversations plus settings for the simulated environment, response pack and agent plan. Bump `AI_SCENARIO_GENERATOR_VERSION` if output meaning changes.

## Simulated voice

Voice support is a lazy subpath so it does not add to the base engine entrypoint:

```ts
import { createVoiceSession } from '@protoyard/ai/voice';

const voice = createVoiceSession({ clock: aiContext.clock, onTranscript: (caption) => handleCaption(caption) });
voice.start('push-to-talk');
await voice.finishListening(); // Emits a deterministic scripted caption after simulated time.
```

Voice input is simulated from scripted captions by default. The engine does not request a microphone, record audio, or call a cloud speech service.
## Rich answers (safe markdown)

The parser has no dependencies and is also published as the `@protoyard/ai/markdown`
subpath, so non-AI kits reuse this one audited implementation without pulling in the
AI engine (ADR-022).

`parseMarkdown(text)` turns simulated model output into a plain-data AST (`MdDocument`:
`blocks` plus numbered `sources`). UI packages render it with components and text nodes;
the AST never contains HTML and must never be rendered with `{@html}`.

```ts
import { inlineText, parseMarkdown } from '@protoyard/ai';
// Or, outside AI prototypes (the views kit editor, comments), the parser alone:
// import { parseMarkdown, safeHref } from '@protoyard/ai/markdown';

const doc = parseMarkdown(message.text);
// doc.blocks: paragraph, heading, code { lang, text, closed }, list { ordered, start, items },
//   quote, table { align, header, rows }, rule
// inline: text, strong, em, del, code, link { href }, image { src | attachmentId },
//   attachment { id, label }, citation { id, index }, break
```

- **Subset:** headings, emphasis, strong, `~~strikethrough~~`, inline code, fenced code (an
  unterminated fence while streaming becomes a code block with `closed: false`), ordered,
  unordered, nested and task lists, quotes, tables with alignment, rules, links and bare
  `https://` URLs.
- **Citations:** `[^id]` in the text plus `[^id]: Title https://…` or `[^id]: [Title](url)`
  definitions. Sources are numbered in definition order; an undefined `[^id]` stays text.
- **Prototype assets:** `![alt](./assets/chart.png)` (relative paths only) and
  `![alt](attachment:<id>)` / `[label](attachment:<id>)` for files the prototype stores.
  Remote and `data:` images render as their alt text.
- **Safety:** raw HTML stays literal text. `safeHref` allows only http(s), mailto and
  relative or `#` targets after stripping the control characters and whitespace browsers
  ignore; `javascript:`, `data:`, `vbscript:`, `file:` and protocol-relative `//host` are
  dropped and the link renders as its label. Fuzz tests feed hostile fragments and check
  that no unsafe URL or executable element comes out.
- **Bounds:** input is cut at `MARKDOWN_MAX_LENGTH` (100,000 characters), nesting deeper
  than 8 levels stays text, link labels and targets longer than 1,024 characters stay text,
  and unmatched delimiters never rescan the input.
- **Size:** about 2.7 KB gzip (esbuild, minified, gzip -9). Import it from the chat UI's
  lazy chunk.

### Chart answers (`@protoyard/ai/chart`)

A response pack can answer "show me signups last week" with a chart. It writes
a fenced ```` ```chart ```` block whose body is a JSON spec:

```ts
import { chartBlock } from '@protoyard/ai/chart';

const reply = `Signups peaked on Wednesday.\n\n${chartBlock({
  kind: 'bar', // line | area | bar | donut | pie | funnel
  title: 'Signups last week',
  unit: 'number', // number | compact | cents (integer cents) | percent (ratios)
  labels: ['Mon', 'Tue', 'Wed'],
  series: [{ label: 'Signups', values: [12, 18, 30] }],
})}`;
```

- `chartBlock(spec)` validates with `ChartSpecSchema` (zod) and throws on an
  invalid spec, so a broken pack fails in its tests.
- `parseMarkdown(text, { charts: true })` turns these fences into
  `{ type: 'chart', text, closed }` blocks with the raw text. Without the
  option they stay code blocks, so the views editor and comments see no new
  block type. The parser itself still has no dependencies; zod lives only in
  the `./chart` subpath.
- Renderers call `parseChartSpec(text)`, which returns `{ ok: true, spec }` or
  `{ ok: false, error }` with a short message that is safe to show as text.
  - It uses `JSON.parse` and the schema; nothing is evaluated.
  - The fence is capped at 20,000 characters, with at most 366 labels and 8
    series. Strings are bounded and unknown keys are rejected.
  - Every series needs one value per label. Donut, pie and funnel charts take
    one non-negative series.

## Attention watchers (`@protoyard/ai/attention`)

Pure, deterministic rules that turn a seeded world snapshot and simulated time
into stable attention items with evidence links. Import the lazy subpath so the
base engine entry stays lean:

```ts
import {
  attentionFixtureWorld,
  attentionWatchersForPreset,
  runWatchers,
} from '@protoyard/ai/attention';

const now = '2026-10-14T18:00:00.000Z';
const world = attentionFixtureWorld(now); // or assemble from your domain tables
const open = runWatchers(world, now, existingItems, {
  watchers: attentionWatchersForPreset('full'),
  cleared: clearedKeys, // approved keys whose condition has gone away
});
```

- **Determinism.** Ids are FNV-1a over `kind:subjectId`, `now` and the generation.
  The same world, instant and existing rows always raise the same additions.
  No `Math.random`, no `Date.now`.
- **Suppression.** An open, dismissed or snoozed row blocks its key. An approved
  row blocks until `cleared` records that the condition went away, then the next
  raise may open a new generation.
- **Built-in watchers.** Overloaded owners, stalled blocked work, slipping
  milestones, quiet stand-up responders, falling team mood, and unposted weekly
  summaries. Thresholds: `OVERLOAD_THRESHOLD` (8), `STALL_DAYS` (5),
  `WORKING_DAY_THRESHOLD` (3).
- **Presets.** `full`, `work-health`, `engagement`, `deadlines`, `none` select
  which watchers run. Pass custom `watchers` or `moraleLeads` through
  `runWatchers` options.
- **Access helpers.** `attentionAccessOf` / `attentionVisibleTo` map simulated
  roles onto who may see or decide. They are UX policy, not real authorization.
- **Honesty.** Items are simulated decision support. Effect execution stays
  behind an explicit service callback in the prototype. Label the queue as
  simulated in the UI.

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
