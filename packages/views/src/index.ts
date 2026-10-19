/**
 * Types only. Every engine lives behind its own subpath
 * (`@protoyard/views/board`, `@protoyard/views/grid`…) so a prototype bundles
 * only the views it uses. Never add runtime exports here.
 */

/** The views kit subpaths, shared by `@protoyard/views` and `@protoyard/views-ui`. */
export type ViewName =
  | 'board'
  | 'calendar'
  | 'timeline'
  | 'grid'
  | 'tree'
  | 'map'
  | 'editor'
  | 'activity'
  | 'notifications'
  | 'files'
  | 'settings'
  | 'states'
  | 'commands'
  | 'scenarios';
