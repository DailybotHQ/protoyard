# @protoyard/ai

Framework-agnostic deterministic simulated AI conversations. Every catalog entry and response is fictional; the package never calls a model provider or uses credentials.

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
