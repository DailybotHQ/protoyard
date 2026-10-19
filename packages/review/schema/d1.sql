-- Apply manually to the D1 database bound to the review Function.
-- The CLI never executes this file. Reviewer names and client ids are not auth.
CREATE TABLE IF NOT EXISTS comments (
  slug TEXT NOT NULL,
  id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  comment_json TEXT NOT NULL,
  PRIMARY KEY (slug, id)
);

CREATE INDEX IF NOT EXISTS comments_by_slug_updated
  ON comments (slug, updated_at);

CREATE INDEX IF NOT EXISTS comments_by_slug_created
  ON comments (slug, created_at, id);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL
);
