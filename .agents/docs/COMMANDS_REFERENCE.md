# Commands Reference

Every command in `.agents/commands/`, what it routes to, and how to invoke it
on any host. Keep this file in sync with the folder; the full kit is in
[skills_agents_catalog.md](skills_agents_catalog.md).

## How to invoke

The behavior is identical everywhere; only the form changes.

| Host | Form | Example |
| --- | --- | --- |
| Claude Code (native slash commands) | `/name` | `/dwp-create` |
| Agents that intercept slash syntax (Codex, Cursor, Gemini…) | `#name` | `#dwp-create` |
| Hosts without slash commands | plain text | "run dwp-create" |

`.claude` and `.cursor` are symlinks to `.agents`, so the same files serve
every harness. When a command is invoked in any form, the agent reads the
command file, then the skill or agent it routes to, fresh, and follows that
procedure. Discovery is local; no network service is consulted.

## Prototypes

| Command | File | Routes to | Does |
| --- | --- | --- | --- |
| `/new-prototype` | `.agents/commands/new-prototype.md` | `.agents/skills/create-prototype/SKILL.md` | Brief → `pnpm protoyard new` → domain, scenarios, UI, tests → validate → export |

The other repository skills have no alias command; invoke them by name
(`/add-scenario`, `#add-entity`, "run validate-and-export") where the host
exposes skills, or ask for them in plain text: `add-scenario`, `add-entity`,
`add-ui-component`, `add-theme`, `validate-and-export`, `publish-prototype`,
`fix-lint`, `write-e2e`.

## Git and review

| Command | File | Routes to | Does |
| --- | --- | --- | --- |
| `/commit` | `.agents/commands/commit.md` | `AGENTS.md` rule 2, `docs/AI_AGENT_COLLAB.md` | Conventional Commit with a Protoyard scope, exact-path staging |
| `/code-review` | `.agents/commands/code-review.md` | `.agents/skills/ai-diff-reviewer/SKILL.md` + `.review/extension.md` | Local review of the branch diff (read-only) |
| `/pr` | `.agents/commands/pr.md` | `.agents/skills/ai-diff-reviewer/open-pr/SKILL.md` | Documented PR title and body; pushing needs approval |

## Deep Work Plans

Thin delegators to the vendored `deepworkplan` skill. Plans live in the
git-ignored `.dwp/plans/`.

| Command | File | Routes to | Does |
| --- | --- | --- | --- |
| `/dwp-create` | `.agents/commands/dwp-create.md` | `.agents/skills/deepworkplan/create/SKILL.md` | Create a plan (Lite, promoted to Full when needed) |
| `/dwp-execute` | `.agents/commands/dwp-execute.md` | `.agents/skills/deepworkplan/execute/SKILL.md` | Execute a plan task by task |
| `/dwp-refine` | `.agents/commands/dwp-refine.md` | `.agents/skills/deepworkplan/refine/SKILL.md` | Change scope, add or split tasks, promote or migrate a plan |
| `/dwp-resume` | `.agents/commands/dwp-resume.md` | `.agents/skills/deepworkplan/resume/SKILL.md` | Resume from the first open task |
| `/dwp-status` | `.agents/commands/dwp-status.md` | `.agents/skills/deepworkplan/status/SKILL.md` | Report plan status (read-only) |
| `/dwp-verify` | `.agents/commands/dwp-verify.md` | `.agents/skills/deepworkplan/verify/SKILL.md` | Check repository and plan conformance (read-only) |
| `/dwp-upgrade` | `.agents/commands/dwp-upgrade.md` | `.agents/skills/deepworkplan/upgrade/SKILL.md` | Check for a newer skill; upgrade only with consent |

## Kit authoring

| Command | File | Routes to | Does |
| --- | --- | --- | --- |
| `/skill-create` | `.agents/commands/skill-create.md` | `.agents/skills/deepworkplan/author/SKILL.md` | Create or update a skill and sync this catalog |
| `/agent-create` | `.agents/commands/agent-create.md` | `.agents/skills/deepworkplan/author/SKILL.md` | Create or update an agent and sync this catalog |

## Vendored skills invoked directly

| Name | Path |
| --- | --- |
| `deepworkplan` and `deepworkplan-<flow>` | `.agents/skills/deepworkplan/` |
| `ai-diff-reviewer` and `ai-diff-reviewer-<capability>` | `.agents/skills/ai-diff-reviewer/` |
