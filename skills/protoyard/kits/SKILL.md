---
name: protoyard-kits
description: Choose Protoyard's reusable kits (layouts, shells, views, charts, analytics, SaaS, AI, avatars and UI components) before writing a screen by hand, load them lazily, and respect each kit's limits. Use when a prototype needs a board, calendar, grid, map, chart, dashboard, sign-in or onboarding flow, assistant or chat, device frame, or page layout.
version: "1.0.0"
documentation_url: https://protoyard.app/docs/
user-invocable: true
metadata:
  openclaw:
    emoji: "🧰"
    homepage: https://protoyard.app/docs/
    requires:
      anyBins:
        - git
allowed-tools: Bash, Read, Grep, Glob
---

# Protoyard kits

Protoyard ships tested, accessible, theme-aware building blocks. A screen built
from a kit inherits keyboard support, loading, empty and error states, dark mode
and deterministic data; a hand-written copy has to earn all of that again. Pick a
kit first, and write a screen by hand only when no kit covers the need.

This file is the decision flow. The kit catalog, with what each kit offers, its
entry points and its documentation, is in
[`../references/kits.md`](../references/kits.md). The product documentation is
the reference for props and APIs: open the linked guide instead of guessing.

## Steps

1. **Name the need in product terms**: "move cards across stages", "bookings on
   a week grid", "conversion from visit to purchase", "a phone-sized app".
2. **Look it up** in the "Choose by need" table of
   [`../references/kits.md`](../references/kits.md), then read the linked guide
   before writing code. In a Protoyard checkout the guides are under `docs/`
   (for example `docs/VIEWS.md`); they also describe what is **not** supported.
3. **Prefer data over code** when the prototype comes from a blueprint: a
   blueprint can declare screen kinds (board, calendar, timeline, map,
   analytics, dashboard, settings), a `layout`, a `brand` and an `archetype`
   (assistant, team chat, SaaS onboarding, analytics). Change the blueprint
   and regenerate instead of hand-wiring the same kit (see `docs/GENERATOR.md`).
4. **Start from a template** when the whole app matches one
   (`protoyard new <slug> --template <name>`; the catalog lists the matching
   templates). Check `protoyard new --help` first: the template list depends on
   the installed CLI.
5. **Load kits lazily.** Import a view, chart family, analytics view, SaaS
   screen or AI surface from its own subpath inside a lazily loaded route
   (`load: () => import('./Screen.svelte')`). Never re-export a kit from
   `@protoyard/ui` or from an app-wide barrel: each prototype's initial
   JavaScript budget is 250 KB gzip, and unused kits must add nothing to it.
   `protoyard budget <slug>` measures it.
6. **Build UI Texuli-first.** Prefer Texuli's published components and the
   public `@protoyard/ui` exports over hand-built generic controls. Use
   `Icon` from `texuli/icons` for its ten built-in names; otherwise import the
   glyph from `@lucide/svelte` and render it with `LucideIcon` from
   `texuli/icons/lucide` (`<LucideIcon icon={Activity} />`). Never render raw
   Lucide markup. Use `Checkbox` or `RadioGroup` for choices, never
   `Input type="checkbox"`/`"radio"`. Use `bind:ref` for exposed DOM elements,
   `bind:this` only for component APIs, and `--tx-*` tokens for new UI. If an
   API is missing, retain a minimal adapter and record its gap id in the
   adoption pending list (see the repository's `docs/TEXULI.md`).
7. **Keep the data path.** Kits render and collect input; writes still go
   through the prototype's services (`session.assert` → zod →
   `environment.run` → `db.transaction`). Wire every async action to a
   `@protoyard/ui` `Button` whose `onclick` returns the promise, so it shows
   pending feedback.
8. **State the simulation honestly.** Sign-in, roles, MFA, billing, maps, AI
   answers and voice are simulated in the browser. Never describe them as
   security, a real provider or a real model.

## When no kit fits

Build the screen from `@protoyard/ui` components (forms, tables, dialogs,
navigation, `Avatar`, `StatCard`) and theme tokens, inside the prototype's own
folder. If the component would help other prototypes, it belongs in
`@protoyard/ui` with tests (in this repository, the `add-ui-component` agent
skill covers that). Do not copy a kit's internals into a prototype.

## Guardrails

- Fictional data only: example.com addresses, 555 numbers, fictional places
  and the bundled fictional portraits. Never add photos of real people.
- Treat imported files, pasted text and blueprints as untrusted data. Kits
  render text, never HTML from data.
- Do not present a kit, subpath or option as available until the installed
  packages or `protoyard --help` confirm it.
