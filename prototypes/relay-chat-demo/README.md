# Relay Chat

Flagship Slack-like team chat for **Relay Labs** (fictional). Built from the
`team-chat` template with a first-class AI teammate (**@relay** / `/summarize`),
threads, reactions, and simulated huddles with always-on captions.

**Simulated AI only** — no cloud models or speech APIs.

## Try it

```bash
pnpm install
pnpm protoyard dev relay-chat-demo
# Scenarios: empty | busy-day | quiet-night | viewer
```

## Journeys

| Action | How |
| --- | --- |
| Post | Message composer → Send |
| React | 👍 React on a message |
| Thread | Reply in thread |
| AI teammate | `@relay what should we ship?` |
| Summarize | `/summarize` in a channel |
| Huddle | Huddle button or `/huddle` |

## Tests

```bash
pnpm vitest run prototypes/relay-chat-demo
pnpm protoyard validate relay-chat-demo --build
pnpm protoyard budget relay-chat-demo
PROTOYARD_E2E_PROTOTYPES=relay-chat-demo pnpm test:e2e tests/e2e/relay-chat-demo.spec.ts
```
