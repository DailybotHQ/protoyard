# Northwind Help: spec

## Problem

Customers of an online store want quick answers about their orders and
returns without leaving the page they are on, and they want a person when
the bot cannot help. Northwind Help explores an embeddable support chat
widget for a fictional outdoor-gear store: a scripted assistant, order
lookup, self-service returns and a handoff to a human, all inside a launcher
panel on the store's site, including what it looks like offline or when the
assistant is down.

## Users

Roles are defined in [PERMISSIONS.md](PERMISSIONS.md).

| User | Role | What they need |
| --- | --- | --- |
| Store customer (Alex Trail, the actor in every scenario) | `visitor` | Ask questions, look up an order, start a return, ask for a human |
| Support agent (Casey Support) | `agent` | Every capability (`*`). There is no agent console: switching to this persona in DevTools shows the same widget. |

The Northwind Help assistant is not a persona: its messages use the fixed
author id `assistant` and it never signs in.

## Capabilities

- Open the widget on the host site; the support thread is ensured on load: [Open the widget and start the support thread](FLOWS.md#open-the-widget-and-start-the-support-thread).
- Send a message and get a streamed, scripted reply: [Send a message and receive a scripted reply](FLOWS.md#send-a-message-and-receive-a-scripted-reply).
- Stop a reply while it streams: [Stop a streaming reply](FLOWS.md#stop-a-streaming-reply).
- Retry a failed or interrupted reply, or regenerate a stopped one: [Retry a failed, stopped or interrupted reply](FLOWS.md#retry-a-failed-stopped-or-interrupted-reply).
- See an unread badge on the launcher: [Read the thread and update the launcher badge](FLOWS.md#read-the-thread-and-update-the-launcher-badge).
- Hand the conversation to a (simulated) human: [Talk to a human](FLOWS.md#talk-to-a-human).
- Look up a fictional order by number: [Look up an order](FLOWS.md#look-up-an-order).
- Start a return for an order and see it in the returns list: [Start a return](FLOWS.md#start-a-return).
- Services without a screen (another conversation, orders by email, list returns): [Service-only operations](FLOWS.md#service-only-operations-no-ui).

## Non-goals

- No real model or AI API. Replies are canned text chosen by keyword, not
  generated, and never call out of the browser.
- No real orders, payments or refunds. Orders are generated fixtures with
  `example.com` emails; a return only writes a row and a chat message.
- No real human agent, live-chat backend, ticketing or notifications. The
  handoff writes one scripted message from "Casey".
- No agent console: there is no screen to read the queue, answer, approve
  or refuse returns. Return statuses after `requested` exist only in the
  type.
- No identity verification: lookup does not check that the order belongs
  to the visitor.
- No real embedding: the host site is drawn by the shell, not a script tag
  on a third-party page.
- No multiple conversations, attachments, message edits or deletion.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `agent-offline` | Offline visitor | Conditions | normal | 42 | `{"history":1,"orders":2}` | Network offline — banner shows; sends and lookups fail (simulated). |
| `first-visit` | First visit | Lifecycle | empty | 11 | `{"history":0,"orders":3}` | Empty support thread with greeting; orders exist to look up. |
| `open-return` | Open return | Lifecycle | normal | 77 | `{"history":1,"openReturn":1,"orders":3}` | A return is already in progress for a delivered order. |
| `outage` | Assistant outage | Conditions | normal | 42 | `{"history":1,"orders":2}` | Assistant replies fail with simulated 500; retry after clearing failures. |
| `returning-customer` | Returning customer | Lifecycle | normal | 42 | `{"history":2,"orders":4}` | Prior chat history plus delivered orders ready for returns. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries) for the standard.

| Concern | In this prototype |
| --- | --- |
| Data | IndexedDB in the visitor's browser (namespace `support-widget-demo`). Nothing is shared between visitors or devices. |
| Identity | Two generated personas (Alex Trail, Casey Support) switched in DevTools during development. There is no sign-in, no customer verification and no account security. |
| Permissions | Simulated roles checked in services with `session.assert`. UX only, not security. Both roles hold every capability today, and `cancel` and `markRead` have no check. |
| AI assistant | Simulated. `scriptedReply` in `src/domain/assistant.ts` returns the first keyword topic that matches (orders, returns, human, greeting) or one of three fallbacks picked by a seeded generator keyed on the prompt, so the same prompt always gets the same answer. `chunkReply` splits it into chunks of two to five words written into the message row about every 45 ms. |
| Human handoff | Simulated. The service writes a fixed message from the `user_agent` persona and sets both handoff flags at once. Nobody is contacted. |
| Orders and returns | Fictional fixtures. Money is integer cents (`totalCents`, `amountCents`); no payment, refund or carrier is involved. Tracking codes are made up (`TRK1000xx`). |
| Network | Simulated by `environment.run`: `agent-offline` sets the network offline (every service that goes through `environment.run` fails and the UI disables its controls); `outage` makes every `assistant.` operation fail with a simulated server error. |
| Time | The simulation clock. Scenarios share the reference time `2026-10-16T15:00:00.000Z`; new messages and returns are stamped from that clock, never wall-clock time. There are no background jobs. |

Known gaps in the code (documented, not fixed):

- The launcher badge: `src/App.svelte` calls `unreadCount` and `markRead`
  on the same change, unordered, and marks the thread read even while the
  panel is closed, so the badge usually shows nothing.
- The order input is prefilled with `NW-10042`, but `agent-offline` and
  `outage` generate only two orders (`NW-10040`, `NW-10041`), so the default
  lookup fails there with "No fictional order matches".
- `retry` deletes the old reply before the new attempt and outside
  `environment.run`; `requestHandoff` can be repeated through the service;
  the assistant keeps replying after a human has joined.
- The services' header comment mentions an `assistant-outage` scenario; the
  scenario id is `outage`.

## Rebuild as a real app

See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app) for the standard.
No vendor below has been chosen.

| Prototype piece | Real counterpart to design |
| --- | --- |
| `src/database/schema.ts` (`conversations`, `messages`, `reads`, `orders`, `returns`) | Server database schema for the support side. `orders` would come from the store's order system rather than live in the chat database. Keep the ids, the `[conversationId+at]` ordering index, integer-cent money and the reply-to-prompt link (`promptId`). |
| Schema version 1 | The first server migration |
| `src/domain/chat.ts` (`ensureSupportThread`, `send`, `retry`, `cancel`, `markRead`, `requestHandoff`, `lookupOrder`, `listOrdersForEmail`, `requestReturn`, `listReturns`, `createConversation`) | API endpoints or server actions with the same inputs, checks and transaction boundaries. Inputs are validated with inline checks today; a real API needs schema validation. `cancel` and `markRead` need a check, and `retry` should be atomic. |
| `scriptedReply` and `chunkReply` in `src/domain/assistant.ts` | A model provider integration with streaming responses, grounding in store policies and the visitor's own orders, safety filtering, escalation rules, rate limits, cost controls, timeouts and cancellation. Still to design. |
| `requestHandoff` and the scripted "Casey" message | A live-chat or ticketing integration: an agent queue, routing, availability and business hours, an agent console, and notifications to the visitor when someone joins |
| `lookupOrder` and `listOrdersForEmail` | Calls to the order system, scoped to the verified customer (sign-in, or order number plus email verification), never a search over all orders |
| `requestReturn` and `returns.status` | A returns workflow: eligibility windows, approval, shipping labels, receiving and refunds through the payment system, with every status after `requested` driven by a real process |
| `policy.roles` (`visitor`, `agent`) | Server-side authorization on every request: customers see only their own thread, orders and returns; agents work from a separate console |
| Personas | A real identity provider or an anonymous visitor session tied to a verified customer |
| `environment.run` failure modes (offline, assistant outage) | The offline banner, disabled controls, failed-reply and Retry states the real widget must still handle |
| Scenarios and `generateChatWorld` | Seed data for staging, demo stores and test fixtures |
| The widget-host shell | A real embed: a loader script, an isolated iframe or web component, cross-origin messaging for the unread badge and open/close, and host-site configuration |
| Screens and flows | The UI to keep. The states in [SCREENS.md](SCREENS.md) are the acceptance list. |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `example.support-widget` |
| slug | `support-widget-demo` |
| name | Northwind Help |
| version | 0.1.0 |
| platform | responsive |
| category | support |
| default scenario | `returning-customer` |
| default theme | `emerald` |
| storage namespace | `support-widget-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
