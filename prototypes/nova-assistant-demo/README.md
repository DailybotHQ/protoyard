# Nova Assistant — `nova-assistant-demo`

An AI assistant product built from the `ai-assistant` template:
project-scoped conversation history, a choice of simulated models with
usage and cost, an agent that asks for approval before using a local tool,
an editable canvas, voice mode with captions, and an embeddable widget on a
fictional host page that opens as a sidebar and expands to full screen.
There is **no real model or AI API**: replies come from deterministic local
response packs and a scripted agent, voice transcripts are scripted, and
only file names of attachments are kept. Everything persists in the
browser (IndexedDB). Roles are simulated: UX only, not security.

```bash
pnpm protoyard dev nova-assistant-demo        # run it (DevTools included in dev)
pnpm vitest run prototypes/nova-assistant-demo
pnpm --filter @prototype/nova-assistant-demo typecheck
pnpm protoyard validate nova-assistant-demo --build
pnpm protoyard budget nova-assistant-demo
```

Eight scenarios, from `fresh-workspace` to `long-history` (one thread of
5,000 messages on a virtualized list) and the `slow-model`, `rate-limited`,
`assistant-outage` and `agent-approval` conditions, are described in
[docs/SPEC.md](docs/SPEC.md#scenarios). Canvas, voice and the widget demo
are loaded only when opened.

## Spec

- [AGENTS.md](AGENTS.md): rules for agents working on this prototype
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, known gaps, rebuild path
- [docs/FLOWS.md](docs/FLOWS.md): each user flow mapped to a service, capability and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, tabs and their states
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations, field notes
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles, capabilities, personas

## Tests

`tests/ai-assistant.test.ts`: deterministic workspaces and the 5,000-message
thread, persisted replies with usage, stopping a stream, memory and privacy
controls, the monthly budget, role checks and a local agent run, and the
request limit and agent approval scenarios.
