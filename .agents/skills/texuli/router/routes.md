# Texuli skill — route by intent

Canonical map for the router in [`../SKILL.md`](../SKILL.md). Prefer this table
when several intents appear in one request: pick the **narrowest** matching row.

| Intent keywords | Guide | Notes |
| --- | --- | --- |
| install skill, setup.sh, host folder, checksums, verify skill | [`../setup.sh`](../setup.sh), [hosts.md](hosts.md) | Consent required before write; dry-run first |
| trust, permissions, no network, consent, provenance, signed | [`../TRUST.md`](../TRUST.md) | Always offline |
| upgrade skill, update skill, newer skill version, latest skill release, skill changelog, Texuli `0.11.0`, `0.10.0`, `0.9.0`, `0.8.0`, `0.7.0`, `0.6.0` and `0.5.0` breaking changes | [`../upgrade/SKILL.md`](../upgrade/SKILL.md) | Read-only tag check, consent, then a pinned `setup.sh --replace` |
| deck from JSON, deck from Markdown, presentation, slides, deck layouts, `DeckStage`, presenter view, PPTX, print deck, `@texuli/deck`, deck CLI, deck MCP tool, deck lint | [`../build-ui/references/decks.md`](../build-ui/references/decks.md) | Deck model v2: write, validate, present, export; in development, on npm from `0.4.0` |
| button, input, dialog, layout, shell, component, dashboard, landing, form flow, slide deck, deck export, rich text editor, build UI, drag and drop, sortable, reorder, kanban, tree reorder, canvas, workflow editor, node graph, `@texuli/drag`, `@texuli/workflows` | [`../build-ui/SKILL.md`](../build-ui/SKILL.md) | Catalog → pick → compose → validate → render |
| theme, palette, dark mode, forced-colors, contrast, AA gate, theme CLI, theme MCP | [`../themes/SKILL.md`](../themes/SKILL.md) | Offline themes and color path |
| design system, brand document, DTCG or Tokens Studio import, logo palette, ds.validate, ds.compile, texuli ds, create-design-system, blueprint designSystem | [`../design-systems/SKILL.md`](../design-systems/SKILL.md) | Brand as data, new in 0.10.0 |
| image, video, audio, captions, waveform, gallery, composition, export, generator slot | [`../media/SKILL.md`](../media/SKILL.md) | Offline media build path |
| primitive, texel, roving, focus scope, behavior scenario, catalog entry, contribute | [`../contribute/SKILL.md`](../contribute/SKILL.md) | Full contributor path A–F |
| consumer app, install, `npm install texuli`, `0.11.0`, `0.11.1`, texuli add, copy source, customize, tokens override, provenance, texuli update, vite, astro, `@texuli/astro`, site model, sitemap, sveltekit | [`../components/SKILL.md`](../components/SKILL.md) | Packages or copied source; update keeps local edits |
| eval, golden tasks, score a model run, skill quality, report-only | [`../evals/SKILL.md`](../evals/SKILL.md) | Offline golden scorer; model runs never gate |
| blueprint, envelope, validateDraft, draft lifecycle, activation, edit ops, undo, player, agent service, chat island, builder, spec, Kotlin projection, JSON UI, `$state`, `$data`, bindings, actions, `on`, `bind`, flow, `reorder`, `workflow-graph`, migrate, spec 0.3.0 | [`../blueprints/SKILL.md`](../blueprints/SKILL.md) | Agents draft, validation gates, the owner activates |
| which package, subpath, export, layer | [packages.md](packages.md) | Derived from package.json exports |

## Rules

1. If the developer names a file or package, stay there.
2. Do not start a Deep Work Plan unless asked.
3. Do not invent npm package names or deploy URLs.
4. Validation stays local: `pnpm exec tsx scripts/check-skill.ts`.
