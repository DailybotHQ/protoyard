---
description: Commit the current work as a Conventional Commit with a Protoyard scope, staging exact paths only
---

# /commit — Conventional Commits for Protoyard

> Thin entry point. The rules live in `AGENTS.md` (Mandatory rule 2) and
> `docs/AI_AGENT_COLLAB.md` ("Commits in a shared checkout"); read them fresh
> if anything below seems to disagree, and follow them.

## What to do

1. `git status --short` and `git diff` — identify **only the paths this task
   changed**. Other modified or untracked files may belong to another agent;
   leave them alone.
2. Run the gates for the touched surface (`docs/TESTING_GUIDE.md`) before
   committing, or say plainly which were not run.
3. Stage exact paths: `git add <path> <path>`. Never `git add -A`,
   `git add .` or a broad parent folder.
4. Message: `type(scope): summary` — imperative, lowercase, no trailing
   period, at most 72 characters; a body explains why when it is not obvious.
   - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`,
     `ci`, `build`, `style`.
   - Scopes: `core`, `database`, `scenarios`, `runtime`, `themes`, `ui`,
     `devtools`, `renderer`, `cli`, `gallery`, `templates`, a prototype slug
     (`crm-demo`), `docs`, `ci`, `deps`, `dwp`.
   - Append any attribution trailer the host or developer requires.
5. If `.git/index.lock` exists, wait a few seconds and retry. Never delete it.
6. Commit with a heredoc so the message keeps its formatting, then show
   `git log --oneline -1`.

## Notes

- Commit only when the developer asked for it in this task.
- Never push; only the lead or developer pushes.
- Other agents: follow the same rules by name ("run commit") if this alias is
  not present in your harness.
