# Running a model eval

Back to [`../SKILL.md`](../SKILL.md).

1. **Give the agent only local context:** the router
   ([`../../SKILL.md`](../../SKILL.md)), the build-ui sub-skill
   ([`../../build-ui/SKILL.md`](../../build-ui/SKILL.md)) and its
   references, and one task's `brief` from `@texuli/tools/golden`
   (`GOLDEN_TASKS`). Nothing from the network, and not the reference trees.
2. **Ask for one catalog tree per brief:** data only, rooted at
   `layout-page`, `layout-doc` or `layout-deck`, tier `untrusted`.
3. **Save the answers** as `run.json`: `{ "<task id>": <tree>, … }`. Keep the
   raw output: the sinks check reads it before any cleanup.
4. **Score it offline** with the golden CLI
   (`pnpm exec tsx packages/tools/src/golden/cli.ts run.json`, as in
   [`../SKILL.md`](../SKILL.md)). It prints totals, then each failing check
   with its issue lines; `--json` gives the same report as data. Axe needs a
   DOM: to include it, score in a test with `scoreGoldenRun(outputs, { axe,
   document })`, as the skill test does.
5. **Report, do not gate:** record the model, date, the skill pack's
   `SHA256SUMS` hash and the per-check totals. A model's score never fails a
   build. Only the recorded runs in [`../runs/`](../runs/) are gated.

**Reading a failure**

| Check | Usually means the agent… | Skill rule |
| --- | --- | --- |
| `schema` | used an unknown or tier-denied id (an overlay), a bad block, or a non-frame root | *Untrusted agent trees* |
| `dontUseWhen` | added a menu, an account control, a purchase link or chrome the brief left to the host | *Catalog guidance is law* |
| `sinks` | emitted a script URL, markup, a `style` or `class` key, or a handler | *Sink-free* |
| `grammar` | skipped a heading rank, or added a second `h1` or `main` | *A11y and contrast* |
| `axe` | produced a tree that renders inaccessibly | *A11y and contrast* |
| `coverage` | left out a component the brief asked for | *Match the brief to ids* (stage B) |

**Adding a recorded tree:** follow `build-ui` by hand for a task, add the
tree to [`../runs/skill-following.json`](../runs/skill-following.json), set
`recorded: true` for it in [`../scenarios.json`](../scenarios.json), then run
the gate and regenerate the pack checksums
(`pnpm exec tsx scripts/check-skill.ts --write-sums`).
