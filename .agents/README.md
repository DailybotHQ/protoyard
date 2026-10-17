# `.agents/` — Protoyard's agent kit

The canonical, cross-agent home for Protoyard's skills, agent personas and
commands. `.claude` and `.cursor` at the repository root are symlinks to this
folder; always edit the real files here. Start with [`../AGENTS.md`](../AGENTS.md)
for the repository rules — everything in this kit follows them.

```text
.agents/
├── README.md        this file
├── settings.json    Claude Code baseline (permissions only; no hooks, no secrets)
├── agents/          personas: reviewer, architect, executor, debugger, qa,
│                    perf-optimizer, security-auditor, prototype-builder,
│                    scenario-designer, ux-polisher
├── skills/          procedures: create-prototype, add-scenario, add-entity,
│                    add-ui-component, add-theme, validate-and-export,
│                    publish-prototype, fix-lint, write-e2e
│                    + vendored: deepworkplan/, ai-diff-reviewer/ (do not edit)
├── commands/        thin entry points: new-prototype, commit, code-review, pr,
│                    dwp-*, skill-create, agent-create
└── docs/            skills_agents_catalog.md, COMMANDS_REFERENCE.md
```

- **What exists and when to use it:** [docs/skills_agents_catalog.md](docs/skills_agents_catalog.md)
- **How to invoke commands on any host** (`/name`, `#name`, plain text):
  [docs/COMMANDS_REFERENCE.md](docs/COMMANDS_REFERENCE.md)

## Conventions

- **Skills** (`skills/<name>/SKILL.md`) hold one procedure each, grounded in
  real files and commands. Frontmatter: `name`, `description` (one line,
  starts with a verb), `version`, `user-invocable`, `allowed-tools`, plus
  documentation keys `tier`, `intent`, `max-files`.
- **Agents** (`agents/<name>.md`) are roles readable by any harness:
  role, when to use, inputs, procedure, output, guardrails, definition of
  done. Frontmatter: `name`, `description`, `tools`, `model: inherit`, plus
  `tier`, `scope`, `can-execute-code`, `can-modify-files`.
- **Model tiers stay abstract** (`light` / `standard` / `heavy`). Agents
  inherit the session model; if your harness routes by tier, map the tiers to
  concrete models in your own harness configuration, never inside a skill or
  agent body.
- **Commands** (`commands/*.md`) are thin: they route to a skill, agent or
  rule document and contain no logic of their own. Every `.md` file in
  `commands/` becomes a slash command, so keep documentation out of it.
- **Vendored skills** (`skills/deepworkplan/`, `skills/ai-diff-reviewer/`)
  are installed from pinned releases; upgrade them with `/dwp-upgrade` or
  their own setup flow, never by hand.

## Changing the kit

Use `/skill-create` or `/agent-create` (the DWP author flow), keep commands
thin, and update both files in `docs/` in the same change so the catalog
always matches disk. Biome ignores `.agents/`, so review Markdown by eye.
