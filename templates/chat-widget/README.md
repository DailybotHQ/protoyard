# Chat widget template

A compact **single-thread support widget** for Protoyard’s `widget-host` shell:
one visitor conversation, a scripted streaming assistant, handoff-to-human
simulation, and an offline banner. Scaffold with:

```bash
pnpm protoyard new my-widget --template chat-widget
pnpm protoyard dev my-widget
```

## Scenarios

| Id | What it shows |
| --- | --- |
| `first-visit` | Empty thread with a greeting; owner can post |
| `returning-visitor` | Prior messages already in the thread |
| `agent-offline` | Network offline — composer blocked with banner |
| `outage` | Assistant replies fail (simulated 500); retry recovers when failures clear |

## Domain rules

Mutations go UI → service → `session.assert` → validate → `environment.run` →
`db.transaction`. The assistant is scripted (`domain/assistant.ts`); no model
API. Unread badges drive `getWidgetHost().setUnread` when the widget-host frame
is present.
