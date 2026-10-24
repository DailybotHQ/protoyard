/**
 * `@protoyard/views-ui/activity` — thin ActivityFeed adapter over Texuli;
 * CommentThread remains a Protoyard host surface (threads/composer).
 */

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
