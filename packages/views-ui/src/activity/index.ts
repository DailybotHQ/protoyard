/**
 * `@protoyard/views-ui/activity` — `CommentThread` (threads, replies, edit and
 * delete, reactions, a composer with mentions stored as ids, pending send) and
 * `ActivityFeed` (day groups, filters, load more), on the
 * `@protoyard/views/activity` engine. Import this subpath only from a lazy
 * route screen.
 */

/** Texuli activity feed (items array API). Prefer ActivityFeed host adapter for liveQuery. */
export {
  ActivityFeed as TexuliActivityFeed,
  type ActivityFeedLabels,
} from '@texuli/data/activity';
export { default as ActivityFeed } from './ActivityFeed.svelte';
export { default as CommentThread } from './CommentThread.svelte';
export {
  type ActivityPerson,
  type ActivityRecord,
  type ComposerEditorProps,
  directAvatar,
  type EditorLoader,
  handleOf,
  personImage,
} from './types.ts';
