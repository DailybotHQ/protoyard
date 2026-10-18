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
