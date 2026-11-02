---
name: texuli-evals
description: Score whether an agent following the Texuli skill builds valid, sink-free, axe-clean interface trees for the 30 golden tasks, offline with the golden scorer; model runs are report-only.
version: "0.3.13"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Skill evals

Use this sub-skill to check that **following this skill pack works**: an
agent that reads the router and [`../build-ui/SKILL.md`](../build-ui/SKILL.md)
and answers a golden task's brief should produce a catalog tree that is:
- **valid** (schema, limits, tier);
- **sink-free**;
- **within its guidance** (`dontUseWhen`);
- **well outlined** (grammar);
- **axe-clean**;
- **complete** (coverage).

Scoring is **offline**, with the golden scorer in `@texuli/tools/golden`: no
network and no model calls. A **model run is report-only**: the scorer
reports, it never fails a build. The recorded runs in [`runs/`](runs/) are
the gate.

## What is here

| File | What it is |
| --- | --- |
| [`scenarios.json`](scenarios.json) | One scenario per golden task (30): the sub-skill to follow, its stages, the rules it relies on, the traps the brief baits, the components it needs, and whether a recorded tree exists |
| `scenarios.json` → `interactive` | Five scenarios beyond the golden set, in the same format plus a `reference`: sortable lists (drag and drop), a workflow editor, and stateful JSON blueprints with `reorder`, an editable `workflow-graph` and the lego composition. They are not scored by the golden scorer (it takes trees, not stateful envelopes); `scripts/tests/skill-evals.suite.ts` checks that their rules and stages are quoted from the followed sub-skill and that each reference (a spec golden or a demo) validates and holds what the scenario needs |
| [`runs/skill-following.json`](runs/skill-following.json) | Trees written by following `build-ui` for ten tasks: all five trap tasks (g03, g06, g08, g17, g30) and five text, data, grid and media tasks. Every check must pass, with axe run, not skipped |
| [`runs/rule-breaks.json`](runs/rule-breaks.json) | Eight trees that each break one quoted `build-ui` rule. The scorer must fail each on the named check |
| [`references/protocol.md`](references/protocol.md) | How to run and report a model eval |

## Run the evals

From the monorepo root:

```bash
# The gate: scenarios, both recorded runs (axe in happy-dom), and this skill's commands
pnpm vitest run scripts/tests/skill.test.ts

# Score a run file offline (Markdown report; axe is skipped without a DOM)
pnpm exec tsx packages/tools/src/golden/cli.ts skills/texuli/evals/runs/skill-following.json
pnpm exec tsx packages/tools/src/golden/cli.ts skills/texuli/evals/runs/skill-following.json --json
```

A model's run uses the same CLI on its own `run.json`
(`{ "<task id>": <tree> }`). See [`references/protocol.md`](references/protocol.md).

## What a pass means, and what it does not

- **It means:** the recorded trees, written by following the skill's
  rules, pass all six checks; and each rule, when broken, is caught by a
  check. So the skill's rules and the scorer agree.
- **It does not mean** a given model follows the skill. That is what a
  model run measures, and it is report-only.
- **Coverage:** ten of the 30 tasks have a recorded skill-following tree. The
  other twenty are scored through the golden set's own reference trees (the
  `@texuli/tools` golden tests). `scenarios.json` marks which are recorded.
