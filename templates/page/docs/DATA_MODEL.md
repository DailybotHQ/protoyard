# Data model

Stores from `defineKindRuntime` (storage schema version 2):

- `blockStates`: interactive block state (polls, quizzes, checklists) per block.
- `formResponses`: canonical `@protoyard/pages` FormResponse rows with optional
  `personaId`.
- `docEdits` (added in version 2): saved doc edits, one row per document and
  doc (`key`, indexed by `documentId`, `docId` and `updatedAt`). A row holds the
  edited doc body and a fingerprint of the doc it was edited from; when the
  blueprint changes, the old edits are reported as stale instead of applied.
  Rows are re-validated on every load. Saving and resetting need the doc edit
  capability, which viewers do not have.
  A page never writes it; the store is shared by every content kind.
