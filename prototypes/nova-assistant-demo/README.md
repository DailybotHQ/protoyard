# Nova Assistant

Nova is a polished assistant-product flagship built from the `ai-assistant` template. It includes project-scoped conversation history, simulated model selection and agent tools, an editable canvas, lazy voice mode, and an embedded widget that opens as a sidebar and expands to full screen. The `long-history` scenario seeds one deterministic 5,000-message conversation to exercise the virtualized thread.

```bash
pnpm protoyard dev nova-assistant-demo
pnpm vitest run prototypes/nova-assistant-demo
pnpm --filter @prototype/nova-assistant-demo typecheck
pnpm protoyard validate nova-assistant-demo --build
pnpm protoyard budget nova-assistant-demo
```

## Scenarios

- `fresh-workspace` — first visit with no conversations.
- `active-workspace` — the default project workspace with folders and conversation history.
- `power-user` — a wider saved-history workspace.
- `long-history` — one thread containing 5,000 generated messages; the assistant view uses the virtualized `MessageList` from `@protoyard/ai-ui`.
- `slow-model`, `rate-limited`, `assistant-outage`, and `agent-approval` — simulated service states for latency, quotas, failures, and explicit local-tool approval.

## Honest boundaries

Every model and agent run is a local deterministic simulation. There are no provider SDKs, credentials, network model calls, real accounts, or external search. The voice mode uses scripted transcripts and visible captions; local speech synthesis is optional, and the microphone is not requested by default. The widget is a demo hosted on a fictional Northstar Journal page. Prototype personas and capability checks are for UX simulation, not security.

Canvas, voice and the widget demo are dynamically loaded when opened. Data is stored in this prototype's IndexedDB namespace and can be explored through DevTools. No data leaves the browser.
