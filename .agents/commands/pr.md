---
description: Author or update a documented pull request for the current branch by routing to the AI Diff Reviewer open-pr sub-skill
---

# /pr — provided by the `ai-diff-reviewer` skill (open-pr)

> Thin delegator. The flow lives in the vendored sub-skill — this file only
> routes to it, so there is a single source of truth and no drift.

## What to do

1. Read `.agents/skills/ai-diff-reviewer/open-pr/SKILL.md` fresh and follow
   it, passing along any arguments (base branch, draft, title hints).
2. For the PR test plan, use the gates that match the touched surface from
   `docs/TESTING_GUIDE.md` and report only commands that actually ran.

## Notes

- Opening a PR pushes the current branch. Pushing to a remote you were not
  asked to push to needs the developer's explicit approval (`AGENTS.md`).
- PR titles follow Conventional Commits with Protoyard scopes (see
  `.agents/commands/commit.md`).
- Other agents: invoke the `ai-diff-reviewer-open-pr` sub-skill directly if
  this alias is not present in your harness.
