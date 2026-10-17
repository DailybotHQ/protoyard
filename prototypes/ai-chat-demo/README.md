# Relay — team AI chat — `ai-chat-demo`

A team chat where people and AI agents work in the same thread. Conversations,
@mentions, agent replies that stream in, unread badges, search, and failure
states, with owner, admin, member and read-only guest personas. There is **no
real AI API**. The three agents (Atlas, Quill, Beacon) give deterministic,
scripted replies. Everything persists in the browser (IndexedDB) and survives
reloads, including a reply that is still streaming.

```bash
pnpm protoyard dev ai-chat-demo        # run it (DevTools included in dev)
pnpm protoyard build ai-chat-demo      # static build → artifacts/ai-chat-demo/dist
pnpm protoyard export ai-chat-demo     # + portable ZIP
pnpm vitest run prototypes/ai-chat-demo
```

Try a scenario directly with a link such as `?scenario=agent-outage#/`. In a
browser that already has data, Relay asks before it replaces that data.

## What you can do

| Area | Route | Real behavior |
| --- | --- | --- |
| Conversation list | always visible on desktop; `#/` on mobile | Pinned conversations first, then the most recent. Each row has an unread badge for the active persona and a preview of the last message. Inbox and Archived views. Full-text search across messages, with links to each match. The "New conversation" dialog lets you pick agents and, optionally, teammates. |
| Welcome | `#/` | A new user gets a welcome screen with an **Ask Atlas** button that creates a real conversation. Everyone else gets a "pick a conversation" screen and an agent directory. |
| Thread | `#/c/:id` | Messages are grouped by author and day. Agents and people have colored avatars. Agent replies use safe Markdown: paragraphs, lists, **bold**, *italics*, `code` and tables, built as elements and never with `{@html}`. Replies grow chunk by chunk with a typing indicator. **Stop** ends a stream. A failed reply shows the error and a **Retry** button. A reply cut off by a reload is marked "interrupted" and can be retried. |
| Composer | — | @mention autocomplete (arrow keys, then Enter or Tab), helper chips with each agent's handle, Enter to send, Shift+Enter for a new line, and starter prompts in an empty conversation. Focus stays in the composer after you send. |
| Conversation menu | thread header | Pin or unpin, rename, archive or unarchive, and delete with a confirmation dialog. Each action is checked by the policy for that conversation. |

Long threads stay fast because only the newest 60 messages render. **Load
earlier messages** adds 60 more and keeps your reading position. The thread
scrolls to new messages only while you are already at the bottom. If you have
scrolled up, a "New messages" button appears instead. The scroll is instant
when the user prefers reduced motion. Screen readers hear each finished agent
reply once, through a polite live region, rather than every streamed chunk.

The layout uses container queries rather than media queries. On wide screens
the list and thread sit side by side; on narrow ones you see one pane at a
time with a back button. This keeps the layout right in the DevTools phone
presets too.

## Data model (`src/database/schema.ts`)

```text
py_personas (people) ─┐
agents ───────────────┼─ participants *─1 conversations 1─* messages
                      │                                  1─* runs ─1 agents
                      └─ messages.authorId (person or agent)
```

- `participants.lastReadAt` drives unread counts. Opening a thread or getting
  a new message while it is open calls `markRead`.
- An agent reply is a **run** that streams into its message row: the row's
  status goes `streaming` → `sent`, or to `failed` with the error text, and
  the run ends as `done`, `error` or `cancelled`.

## Roles (`src/domain/policy.ts`): simulated, not real security

| Role | Can |
| --- | --- |
| `owner`, `admin` | Everything |
| `member` | Chat, invoke agents, create conversations; rename, archive or delete **only conversations they created** |
| `viewer` | Read only. A banner explains this and the composer is disabled with the reason. |

Services call `session.assert(capability, record)`, so a forbidden action
fails even from the browser console.

## Scenarios (`src/scenarios/`)

| Id | What it shows |
| --- | --- |
| `empty-new-user` | Brand-new owner with no conversations, so the welcome screen and Ask Atlas quick start appear |
| `active-team` *(default)* | Six people and three agents, two months of history, some unread threads |
| `member-view` | The same team seen by a member (manages only their own conversations) |
| `viewer-view` | Read-only external guest |
| `agent-outage` | Chat works but every agent request fails (simulated 500): a banner, failed replies and Retry |
| `long-thread` | Adds a 600-message "All-hands archive" for scroll, search and rendering checks |

Being offline (DevTools → Environment) shows a banner. Sends then fail with a
toast and keep your draft.

## Tests

- `tests/generators.test.ts`: determinism and integrity of every scenario.
- `tests/services.test.ts`: streaming replies, outages with retry, and
  role rules, all on the real runtime with an in-memory IndexedDB.
- `tests/read-state.test.ts`: `markRead` clears replies stamped after a frozen
  simulated clock, concurrent agent replies get distinct timestamps, and run
  liveness plus cancelling a run orphaned by a reload.
- `tests/ui-helpers.test.ts`: the safe Markdown parser (including the
  comparison table, and markup that stays plain text), @mention detection and
  insertion, conversation sorting and message grouping.
