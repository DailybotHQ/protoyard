# Team chat template

Slack-like team messaging for Protoyard prototypes. **Simulated AI only** — bots answer from
deterministic packs; huddles use local captions (and optional `speechSynthesis`) via
`@protoyard/ai` `createVoiceSession`. No cloud speech APIs, no real model providers.

## Features

| Area | Behavior |
| --- | --- |
| Workspaces & channels | Public/private channels, create channel, DMs |
| Messages | Channel posts, threads, unread markers |
| Reactions | Toggle emoji reactions |
| Mentions & slash | `@standup` / `/ops` / `/people` summon bots; `/huddle` starts a huddle |
| Presence | Seeded + timeline-driven (`presence.tick`) |
| Search | Workspace-wide substring search |
| Files | Share metadata rows + system message (no real blobs required) |
| Huddles | Simulated voice session with always-on captions |
| Roles | owner / member / viewer via `domain/policy.ts` |

## Commands

```bash
pnpm protoyard new my-team --template team-chat
pnpm protoyard dev my-team
pnpm vitest run templates/team-chat
pnpm --filter @protoyard-template/team-chat typecheck
```

## Architecture

Mutations go **UI → `createTeamChatServices` → `session.assert` → zod → `environment.run` →
`db.transaction`**. Generators use only `ctx.rng` / `ctx.ids` / `ctx.time`. Timeline events
advance presence and optional channel chatter when time advances in DevTools.

## Scenarios

- `empty` — #general only, no history  
- `busy-day` — channels, DMs, threads, reactions, file share  
- `quiet-night` — lighter traffic as a member  
- `viewer` — read-only  

## Honesty

Bots and huddles are **demo fiction**. UI copy labels them as simulated. Do not describe
them as production AI or telephony.
