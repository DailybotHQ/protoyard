---
description: Review the current branch diff locally with the vendored AI Diff Reviewer skill and this repository's .review/extension.md rules
---

# /code-review — provided by the `ai-diff-reviewer` skill

> Thin delegator. The review methodology lives in the vendored skill — this
> file only routes to it, so there is a single source of truth and no drift.

## What to do

1. Read `.agents/skills/ai-diff-reviewer/SKILL.md` fresh and run its local
   review capability on the current branch diff, passing along any arguments
   (base branch, paths).
2. The skill auto-detects `.review/extension.md`; make sure it is applied —
   it holds Protoyard's severity overrides (path guards, child processes,
   control server, snapshots, isolation, determinism, honesty).

## Notes

- Read-only: the review reports findings; it does not edit, commit or push.
- For a human-style second pass, the `reviewer` agent
  (`.agents/agents/reviewer.md`) covers the same rules plus the gates.
- Other agents: invoke the `ai-diff-reviewer` skill directly if this alias is
  not present in your harness.
