# AGENTS.md — Nova Assistant (`nova-assistant-demo`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- Replies are simulated, never a real model. They come from response packs
  and `createAiAgentRunner` in `@protoyard/ai`, seeded by the manifest id and
  the prompt. Never add a provider SDK, API key or network call, and never
  describe the Orbit models, the agent or voice mode as real.
- Every reply goes through `generateReply` in `src/domain/services.ts`: zod
  prompt check, model check, agent approval, request and monthly limits,
  then the transaction inside `environment.run('ai.conversation.send')`.
  Response packs run inside `environment.run('ai.generate')`, which is what
  `assistant-outage` fails.
- Workspace state is the single `settings` row with id `workspace`
  (instructions, memory, limits, canvas, folders). Keep it one row unless
  you add a schema version.
- `usage.costUsd` is a simulated float in dollars, not money that is charged;
  token counts are `ceil(characters / 4)` estimates.
- `long-history` seeds 5,000 messages: keep the thread on the virtualized
  `MessageList` from `@protoyard/ai-ui`, and keep canvas, voice and the
  widget demo dynamically imported.
- Routes live in `src/App.svelte` (no `src/routes.ts`); Voice and Widget
  demo are tabs, not routes. Update [docs/SCREENS.md](docs/SCREENS.md) by
  hand when they change.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev nova-assistant-demo                  # run it (DevTools included)
pnpm vitest run prototypes/nova-assistant-demo          # unit + integration tests
pnpm protoyard validate nova-assistant-demo --build     # contract, schema, build
pnpm protoyard spec nova-assistant-demo --check         # generated spec regions are current
pnpm protoyard export nova-assistant-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
