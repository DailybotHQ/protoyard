---
description: Create a new Protoyard prototype from a brief by routing to the create-prototype skill
---

# /new-prototype — provided by the `create-prototype` skill

> Thin delegator. The flow lives in the skill — this file only routes to it,
> so there is a single source of truth and no drift.

## What to do

1. Read `.agents/skills/create-prototype/SKILL.md` fresh and follow it.
2. Pass along the arguments: the slug, the template (if given) and the brief.
   For a large brief, the `prototype-builder` agent
   (`.agents/agents/prototype-builder.md`) can own the whole build.

## Notes

- Writes only inside `prototypes/<slug>`; variants are new slugs.
- In a shared checkout, scaffold with `--no-install` unless you own the
  lockfile.
- Other agents: invoke the `create-prototype` skill directly if this alias is
  not present in your harness.
