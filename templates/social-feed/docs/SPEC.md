# Social Feed: spec

## Problem

Community products live or die by a feed that feels alive: posts from people you follow, quick reactions and replies, and notifications when someone engages. This template is a working social feed on simulated data, ready to remix into a community, an internal social network or a creator app.

## Users

- **Members** (`member`, Mila) post, react, comment, follow and delete their own posts.
- **Moderators** (`moderator`, Kofi) do the same and remove anyone's post.
- **Viewers** (`viewer`, Hana) read the feed, profiles and people without interacting.

## Capabilities

- Write a post with optional @mentions and a placeholder image ([Post](FLOWS.md#post)).
- React and comment on posts ([React and comment](FLOWS.md#react-and-comment)).
- Follow and unfollow people ([Follow someone](FLOWS.md#follow-someone)).
- Read and clear notifications ([Read notifications](FLOWS.md#read-notifications)).
- Delete your own posts, or any post as a moderator ([Delete a post](FLOWS.md#delete-a-post)).
- Scroll thousands of posts smoothly (the `massive` scenario).

## Non-goals

- No direct messages, hashtags, reposts or algorithmic ranking: the timeline is newest first.
- No uploads or link previews: images are generated placeholders.
- No editing posts after publishing.
- No real-time sync between browsers: activity comes from the simulated timeline.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Lively community | Lifecycle | normal | 4242 | `{"social":{"days":30,"postsPerDay":8}}` | A month of posts, reactions and comments; you follow a dozen people and have a few unread notifications. |
| `empty` | Brand-new network | Lifecycle | empty | 101 | `{"social":{"seed":false}}` | People have joined but nobody has posted yet. Every empty state, and the composer is ready. |
| `massive` | Massive feed | Lifecycle | massive | 9001 | `{"social":{"days":30,"postsPerDay":8}}` | About 6,000 posts in a month (25× the density): the feed renders only the rows on screen. |
| `moderator` | Moderator view | Lifecycle | normal | 4242 | `{"social":{"days":30,"postsPerDay":8}}` | The “Lively community” shape seen by a moderator, who can remove anyone’s post. |
| `viewer` | Read-only viewer | Lifecycle | normal | 4242 | `{"social":{"days":30,"postsPerDay":8}}` | The “Lively community” shape seen by a viewer, who can read but not post, react, comment or follow. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

- **Data:** every person, post and notification is fictional and lives in the visitor's browser (IndexedDB).
- **People:** personas replace authentication. Roles are simulated permissions (UX only, not security); there is no real moderation.
- **Media:** images are CSS gradients with a description; nothing is uploaded or fetched.
- **Network:** latency, offline and failures come from the simulated environment (DevTools).
- **Time:** new reactions, comments, follows and mentions arrive only when simulated time advances.

## Rebuild as a real app

| Prototype piece | Real counterpart |
| --- | --- |
| `posts`, `reactions`, `comments`, `follows` | A social graph store with unique constraints (one reaction per person and post, one follow per pair) and counters |
| `timeline()` (newest first, in the browser) | A fan-out or query-time timeline service with pagination cursors |
| `VirtualFeed` | Kept as is, fed by cursor pagination instead of every row |
| `notifications` + the `eventStream()` timeline | A notification service fed by real events, with push or email delivery and read state per device |
| Plain-text rendering | Kept; add server-side sanitization if rich text is ever allowed |
| `policy.ts` + personas | Real accounts, moderation tools and audit logs |
| Scenarios | Fixtures and staging data |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.social-feed` |
| slug | `social-feed` |
| name | Social Feed |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `rose` |
| storage namespace | `template-social-feed` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
