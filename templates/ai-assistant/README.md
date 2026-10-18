# AI Assistant

A reusable assistant-product starter with project-scoped conversation history, search, folders, a simulated model picker, editable canvas, simulated agent mode, lazy voice mode, workspace instructions and memory controls, local data controls, and a simulated token budget.

```bash
pnpm protoyard new my-assistant --template ai-assistant
pnpm protoyard dev my-assistant
pnpm vitest run prototypes/my-assistant
pnpm --filter @prototype/my-assistant typecheck
```

## What is simulated

Every listed model is a local Protoyard simulation. Replies are selected from deterministic response packs; the agent mode uses a fictional local search index. There are no model-provider SDKs, credentials, network model requests, or real accounts. The voice panel is imported only when opened. It presents scripted transcripts and captions; speech output uses the browser's local speech synthesis when available. Microphone access is not requested by default.

Conversation, project, setting, memory and usage data are stored in the prototype's IndexedDB. Custom instructions and enabled memory influence simulated responses. The **Private** data mode omits saved memory from the prompt context. The usage limit is enforced against recorded simulated tokens for the simulated-clock month. Clearing workspace data removes local projects, conversations and messages; settings remain available.

The starter includes fresh, active, power-user, slow-model, rate-limited, outage and agent-approval scenario variations. Request limits use the simulated clock; the approval scenario asks before a local simulated tool run. Use DevTools to switch scenarios, personas, simulated time and environment conditions.

## Extend it

- Add response packs in `@protoyard/ai` or compose deterministic fixtures in `src/scenarios/generators.ts`.
- Add domain records only in `src/domain/services.ts`, following `session.assert` → zod validation → `environment.run` → Dexie transactions.
- Add workspace settings in `src/screens/Settings.svelte`; keep privacy and simulation boundaries explicit.
- Keep voice and other optional features behind lazy imports to protect the initial bundle budget.
