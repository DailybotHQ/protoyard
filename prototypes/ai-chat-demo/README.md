# Relay — team AI chat — `ai-chat-demo`

A team chat where people and AI agents work in the same thread:
conversations, @mentions, agent replies that stream in, unread badges,
search, and failure states, with owner, admin, member and read-only guest
personas. There is **no real AI API**: the three agents (Atlas, Quill,
Beacon) give deterministic, scripted replies. Everything persists in the
browser (IndexedDB) and survives reloads, including a reply that is still
streaming. Roles are simulated: UX only, not security.

```bash
pnpm protoyard dev ai-chat-demo        # run it (DevTools included in dev)
pnpm protoyard build ai-chat-demo      # static build → artifacts/ai-chat-demo/dist
pnpm protoyard export ai-chat-demo     # + portable ZIP
pnpm vitest run prototypes/ai-chat-demo
```

Try a scenario directly with a link such as `?scenario=agent-outage#/`. In a
browser that already has data, Relay asks before it replaces that data.

## Spec

- [AGENTS.md](AGENTS.md): rules for agents working on this prototype
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, rebuild path
- [docs/FLOWS.md](docs/FLOWS.md): each user flow mapped to a service, capability and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations, field notes
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles, the member rule, personas

## Tests

- `tests/generators.test.ts`: determinism and integrity of every scenario, scripted replies and lossless chunking.
- `tests/services.test.ts`: streaming replies, outages with retry, role rules and archived conversations, on the real runtime with an in-memory IndexedDB.
- `tests/read-state.test.ts`: `markRead` after a frozen clock, distinct timestamps for concurrent replies, run liveness and cancelling a run orphaned by a reload.
- `tests/ui-helpers.test.ts`: the safe Markdown parser, @mention detection and insertion, conversation sorting and message grouping.
