# Social Feed: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Post

1. On Feed, a member writes in the composer (optionally **Image** for a placeholder, `@handle` to mention) and selects **Post** (or Ctrl/⌘ + Enter).
2. Service: `posts.create({ text, withImage })` in src/domain/services.ts
3. Capability: `posts:create`
4. Writes: `posts`; a `mention` notification for each mentioned person
5. Failure states: empty or over 500 characters (inline error); permission denied (viewer); simulated offline (nothing written)

## React and comment

1. On a post, a member selects a reaction (again to remove it, another to switch), or opens the comments and replies.
2. Service: `reactions.toggle(postId, kind)`, `comments.add(postId, { text })`
3. Capability: `social:interact`
4. Writes: `reactions` or `comments`; the post's `reactionCounts` or `commentCount`; a notification for the author (not for yourself)
5. Failure states: the post was deleted; empty or long comment; permission denied; offline

## Follow someone

1. On People or a profile, a member selects **Follow** or **Following** (to unfollow).
2. Service: `follows.toggle(personId)`
3. Capability: `social:interact`
4. Writes: `follows` (unique per pair); a `follow` notification on follow
5. Failure states: following yourself (field error); permission denied; offline

## Read notifications

1. On Notifications, a member marks one item read or selects **Mark all read**. New items arrive as simulated time advances.
2. Service: `notifications.markRead(id?)`
3. Capability: `social:interact`
4. Writes: `notifications.read`
5. Failure states: permission denied; offline

## Delete a post

1. On a post, its author (or a moderator) selects the delete button.
2. Service: `posts.remove(id)`
3. Capability: `posts:create`; another person's post needs `posts:moderate`
4. Writes: deletes the post, its reactions, comments and notifications in one transaction
5. Failure states: permission denied (a member deleting someone else's post); offline

## Activity arrives (no user action)

1. Advancing simulated time runs `socialTimeline`: `eventStream()` activity aimed at the actor, resolved by `notificationFor` against current rows.
2. `applyEvent` in src/prototype.ts writes the notification, plus the reaction (with the count), the comment (with the count) or the follow it describes.
