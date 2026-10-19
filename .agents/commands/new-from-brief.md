---
description: Turn a product brief into a generated Protoyard prototype by following the brief-to-prototype skill.
---

# /new-from-brief — provided by the `brief-to-prototype` skill

> Thin delegator. The procedure lives in the skill; this command only routes
> to it.

## What to do

1. Read `.agents/skills/brief-to-prototype/SKILL.md` fresh and follow its
   procedure.
2. Pass along the brief and any product name, slug, template or archetype
   preference. Preserve review of the synthesized blueprint before generation
   unless the user asks for the direct `--generate` flow.

## Notes

- Keep generated output inside a new `prototypes/<slug>` and never edit
  `src/generated/**` by hand.
- Other agents: invoke the `brief-to-prototype` skill directly if this alias is
  not present in your harness.
