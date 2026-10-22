/**
 * Snapshot the attention watchers read.
 *
 * Services assemble this from domain tables, then call `runWatchers`. The kit
 * never imports Dexie or a prototype schema — keep world assembly outside.
 */

export interface WatchPerson {
  id: string;
  firstName: string;
  fullName: string;
  role: string;
}

export interface WatchTask {
  id: string;
  key: string;
  title: string;
  /** Workflow category: `todo` | `in_progress` | `done` | `canceled` | … */
  category: string;
  open?: boolean;
  ownerId: string | null;
  dueDate: string | null;
  updatedAt: string;
  boardId: string | null;
  milestoneId: string | null;
}

export interface WatchComment {
  taskId: string;
  body: string;
}

export interface WatchMilestone {
  id: string;
  name: string;
  dueDate: string;
  projectId: string | null;
  taskIds: string[];
}

export interface WatchResponse {
  personaId: string;
  /** Local calendar day `YYYY-MM-DD`. */
  date: string;
}

export interface WatchMood {
  teamId: string;
  period: string;
  score: number;
}

export interface WatchSummaryFact {
  id: string;
  dueDate: string;
  posted: boolean;
}

export interface WatcherWorld {
  timezone: string;
  people: WatchPerson[];
  tasks: WatchTask[];
  comments: WatchComment[];
  milestones: WatchMilestone[];
  responses: WatchResponse[];
  /** Stand-up the nudge links to. Empty means the evidence path omits an id. */
  checkinId: string;
  mood: WatchMood[];
  summaries: WatchSummaryFact[];
}
