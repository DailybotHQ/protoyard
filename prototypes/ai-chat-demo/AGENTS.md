# AGENTS.md — Relay — team AI chat (`ai-chat-demo`)

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

- Agents are scripted, never a real model. Replies come from `scriptedReply`
  and `chunkReply` in `src/domain/agents.ts` and must stay a pure function of
  (agent, prompt). Never add a real AI API call or describe the agents as one.
- Agent requests go through `environment.run('agents.<handle>')` so offline
  and outage modes apply. Keep the run row and its empty `streaming` reply
  written before the call, and end every run through `finish` (`done`,
  `error` or `cancelled`).
- Stamp messages with `nextAt(conversationId)`, never `clock.now()` alone:
  the clock can be frozen and replies must sort after their prompt.
- Members manage (rename, archive, delete) only conversations they created
  (`conversations:manage` rule). Archived conversations are read-only in the
  service (`assertWritable`), not only in the UI.
- Agent Markdown is rendered as elements by `src/lib/markdown.ts` and
  `RichText.svelte`; never `{@html}` on message bodies.
- Routes live in `src/App.svelte` (no `src/routes.ts`); update
  [docs/SCREENS.md](docs/SCREENS.md) by hand when they change.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev ai-chat-demo                  # run it (DevTools included)
pnpm vitest run prototypes/ai-chat-demo          # unit + integration tests
pnpm protoyard validate ai-chat-demo --build     # contract, schema, build
pnpm protoyard spec ai-chat-demo --check         # generated spec regions are current
pnpm protoyard export ai-chat-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
