# Northwind Help (support-widget-demo)

Flagship **widget-host** prototype: a fictional outdoor-gear store’s support
chat with order lookup, returns, human handoff, and offline mode.

```bash
pnpm protoyard dev support-widget-demo
pnpm protoyard validate support-widget-demo --build
```

## Scenarios

| Id | What it shows |
| --- | --- |
| `first-visit` | Greeting only; orders ready to look up |
| `returning-customer` | Prior chat + delivered orders |
| `open-return` | A return already in progress |
| `agent-offline` | Network offline (simulated) |
| `outage` | Assistant replies fail until failures clear |

Orders use `example.com` emails and integer-cent totals. Nothing is real commerce.
