# Update a copied component: `texuli diff` and `texuli update`

Back to [`../SKILL.md`](../SKILL.md).

A copied component is updated by a **three-way merge**:
- **base:** Texuli at the version first copied (the `version` in the
  provenance block). Keep a checkout of it, for example `../texuli-0.1.0`.
- **local:** the app's copy, with the developer's edits.
- **upstream:** the newer Texuli (`--source-root`).

1. `texuli diff <id>` prints each file's status and the diff it would apply.
   It never writes.
2. `texuli update <id> --dry-run` shows the plan.
3. `texuli update <id> --version <new>` applies it and restamps the
   provenance blocks.

| Status | Meaning |
| --- | --- |
| `unchanged` | The copy already equals the new source |
| `fast-forward` | The copy was not edited: replaced by the new source |
| `kept-local` | Only the developer changed it: their edit stays |
| `merged` | Both changed different lines: merged |
| `conflict` | Both changed the same lines: refused (or `--conflicts markers`) |
| `needs-base` | No `--base-root` to tell edits apart: `update` refuses |

On any refusal, `update` writes **nothing**. Resolve conflicts with the
developer; never pick a side silently. Files without a provenance block are
never touched. See `packages/tools/docs/cli-update.md`.
