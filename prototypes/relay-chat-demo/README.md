# Relay Chat

Flagship Slack-like team chat for **Relay Labs** (fictional). Built from the
`team-chat` template with a first-class AI teammate (**@relay** / `/summarize`),
threads, reactions, and simulated huddles with always-on captions.

**Simulated AI only** — no cloud models or speech APIs. Data lives in your
browser (IndexedDB); personas and permissions are simulated, not security.

## Try it

```bash
pnpm install
pnpm protoyard dev relay-chat-demo
# Scenarios: empty | busy-day | quiet-night | viewer
```

Post in the composer, "👍 React" and "Reply in thread" on a message, ask
`@relay what should we ship?`, send `/summarize`, and start a huddle with the
"Huddle" button or `/huddle`. Every journey is in
[docs/FLOWS.md](docs/FLOWS.md).

## Docs

- [AGENTS.md](AGENTS.md): rules for agents working on this prototype
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/FLOWS.md](docs/FLOWS.md) ·
  [docs/SCREENS.md](docs/SCREENS.md) · [docs/PERMISSIONS.md](docs/PERMISSIONS.md)

## Tests

```bash
pnpm vitest run prototypes/relay-chat-demo
pnpm protoyard validate relay-chat-demo --build
pnpm protoyard budget relay-chat-demo
PROTOYARD_E2E_PROTOTYPES=relay-chat-demo pnpm test:e2e tests/e2e/relay-chat-demo.spec.ts
```
