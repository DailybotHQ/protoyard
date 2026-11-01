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

- `tests/services.test.ts` (the only file since PLAN_009): the boot smoke (determinism and integrity of every scenario, then a real-runtime boot), a message that persists and streams the scripted reply, the guest and member role rules, and markup-looking text kept as plain text. It runs on the real runtime with an in-memory IndexedDB.
- `tests/e2e/ai-chat-demo.spec.ts`: a streamed reply with safe Markdown, and an outage with Retry.
