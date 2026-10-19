# Team chat: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

Membership and write path notes (aligned with `relay-chat-demo`):

- `joinChannel` — public only; `environment.run('channel.join')` + transaction
  on `channelMembers`.
- `sendMessage` / react / share / huddle — require membership (no auto-join).
- `listMessages` / `search` / `markRead` — private and DMs filtered by
  membership; public is readable without joining.
- Mutations use `environment.run` and `db.transaction` (including reactions,
  presence, markRead, huddle start/end/captions, file+message).
- UI disables write actions for viewers and shows a read-only reason.
