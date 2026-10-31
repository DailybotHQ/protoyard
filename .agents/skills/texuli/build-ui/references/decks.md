# Decks: JSON, Markdown, stage, export and agent tools

The deck generator: one validated deck model (v2) that you write as JSON or
as Markdown, presented by the `@texuli/slides` stage and exported to print,
PDF and PPTX.

**Status: in development, on npm from `0.4.0`.** `@texuli/deck` (the L0
engine) is first published in `0.4.0`. The `@texuli/slides` v2 stage (from `0.4.0`) is
built on it (L8); `@texuli/slides` `0.3.0` carries the previous model (the v1
recipe in [`recipes.md`](recipes.md) section 4). Spec `0.4.0`, which encodes
deck model v2, ships in `@texuli/spec` `0.4.0`. A consumer app installs
`@texuli/deck` and `@texuli/slides` `0.4.0` or later; never `0.3.0` for v2
decks.

| Package | Layer | Use it for |
| --- | --- | --- |
| `@texuli/deck/model` | L0 | `parseDeck`, `loadUntrustedDeck`, `migrateDeck`, `DECK_LAYOUTS`, `deckJsonSchema`, style and backgrounds |
| `@texuli/deck/markdown` | L0 | `parseDeckMarkdown`, `deckToMarkdown`, `deckToText`, `deckOutline` |
| `@texuli/deck/authoring` | L0 | typed `deck()` builder, `generateDeckFromBrief`, `lintDeck`, `applyDeckPatch` (RFC 6902) |
| `@texuli/deck/templates` | L0 | `createDeckTemplate` (`pitch`, `review`, and the outline ids) |
| `@texuli/deck/engine` | L0 | navigation, `#/<slide>/<step>` routing, controls, canvas fit, presenter protocol, `createDeckController` |
| `@texuli/deck/math` | L0 | `texToMath`: a TeX subset to a MathML node tree (no `\href`, `\color`, macros) |
| `@texuli/slides/stage` | L8 | `DeckStage`, `prepareDeck`, `validateDeckBlock` |
| `@texuli/slides/export` | L8 | `DeckPrintView`, `planDeckPrint`, `requestDeckPdf`, `exportDeckPptx` |

## 1. A deck from JSON

```json
{
  "formatVersion": 2,
  "meta": { "title": "Quarterly review", "locale": "en" },
  "style": { "theme": "nord", "aspect": "16:9", "transition": "fade" },
  "slides": [
    {
      "id": "cover",
      "layout": "title-hero",
      "notes": "Welcome everyone and set the goal of the review.",
      "props": { "title": "Quarterly review", "subtitle": "Example Co. · Q3" }
    },
    {
      "id": "adoption",
      "layout": "big-stat",
      "props": { "number": "87%", "label": "of releases shipped the day they merged" }
    },
    {
      "id": "plan",
      "layout": "free",
      "title": "Next quarter",
      "blocks": [
        { "type": "heading", "level": 2, "text": "Next quarter" },
        { "type": "text", "markdown": "Ship smaller changes.", "step": 1 },
        { "type": "text", "markdown": "Release every day.", "step": 2, "fragment": "fade-up" },
        {
          "type": "component",
          "component": "charts-bar",
          "height": "md",
          "props": {
            "title": "Releases per month",
            "series": [{ "id": "r", "label": "Releases", "points": [{ "x": "Jan", "y": 12 }, { "x": "Feb", "y": 22 }] }]
          }
        }
      ]
    },
    {
      "id": "orders",
      "layout": "component",
      "component": {
        "component": "data-grid",
        "props": {
          "caption": "Open orders",
          "columns": [{ "id": "customer", "header": "Customer" }],
          "rows": [{ "id": "o1", "cells": { "customer": "Northwind Example" } }]
        }
      }
    }
  ]
}
```

- `formatVersion` is always `2`; `meta.title` is required. `style` (theme,
  `fontPair`, `aspect` 16:9 · 4:3 · 9:16 · 1:1, density, radius, motion,
  transition, background, logo, footer, `slideNumbers`, progress, `math`),
  `navigation` (`start`, `loop`, `autoSlideMs`) and `outline` (sections,
  `stack: true` for vertical stacks) are optional.
- A slide is discriminated by `layout`: one of the 20 catalog layouts with
  strict `props`; `free` with `blocks` (any `@texuli/blocks` block plus
  inline `{ "type": "component", "component": "<catalog id>", "props": {} }`
  items, optional `master`); `component` (one whole-slide catalog component);
  `custom` (a host-registered painter, a placeholder without one).
- Every slide may carry `notes` (up to 6,000 characters), `hidden`,
  `background` (13 presets such as `gradient-brand`, or a color, image or
  video spec; a contrast scrim keeps text AA), `transition` (`none`, `fade`,
  `fade-up`, `slide`, `zoom`, `morph`), `theme` and `steps` labels.
- Steps: `step` (a number), `fragment` (`in`, `fade-up`, `out`,
  `in-then-out`, `grow`, `shrink`, `highlight` with a tone, `strike`) or
  `reveal`. More than 32 steps on one slide is an error.

Validate before anything paints:

```ts
import { loadUntrustedDeck, parseDeck } from '@texuli/deck/model';
import { validateDeckBlock } from '@texuli/slides/stage';

// Agent or user text: byte, depth and node bounds, plain-data copy, migration, parseDeck.
const loaded = loadUntrustedDeck(jsonText, { validateBlock: validateDeckBlock });
if (!loaded.ok) report(loaded.issues); // every issue: code, severity, path, jsonPath, message, fix

// App-authored data you already trust as JSON:
const parsed = parseDeck(data);
```

Issues are `DeckDiagnostic`s (all of them at once, capped at 200, never a
throw). `migrateDeck` converts a Texuli v1 deck, a grammar tree or a
Protoyard deck; `deckJsonSchema()` exports JSON Schema 2020-12 for agents.
The typed builder from `@texuli/deck/authoring`
(`deck(meta).add(slide.titleHero(props, { id: 'cover' })).build()`) and
`createDeckTemplate('pitch')` produce the same validated shape.

## 2. A deck from Markdown

The deck Markdown dialect is owned by Texuli. reveal.js inspired its syntax;
it is not reveal.js-compatible, and there is no HTML: raw HTML, iframes,
`class`, `style` and `on*` are refused with a diagnostic.

~~~markdown
---
title: Quarterly review
locale: en
theme: nord
aspect: 16:9
transition: fade
---

<!-- .slide: id=cover layout=title-hero -->

# Quarterly review

Example Co. · Q3

Note: Welcome everyone.

---

<!-- .slide: id=split layout=two-column-split title="Before and after" -->

## Before and after

::: left
### Before
Weekly release windows.
:::

::: right
### After
Same-day releases.
:::

---

<!-- .slide: id=code -->

## One pass

```ts [1|2]
const total = items.reduce((a, b) => a + b, 0);
console.log(total);
```

--

<!-- .slide: id=formula -->

$$
\frac{a + b}{2}
$$

- Ship small <!-- .element: fragment=fade-up -->
- Release daily <!-- .element: fragment=fade-up -->

---

## Releases

::: component charts-bar {height=md step=1}
{ "title": "Releases per month", "series": [{ "id": "r", "label": "Releases", "points": [{ "x": "Jan", "y": 12 }] }] }
:::
~~~

| Syntax | Meaning |
| --- | --- |
| Frontmatter | Closed scalar keys: `title`, `description`, `author`, `date`, `locale`, `dir`, `theme`, `themeMode`, `themeSeed`, `fontPair`, `aspect`, `density`, `radius`, `motion`, `transition`, `background`, `logo`, `footer`, `slideNumbers`, `progress`, `codeTheme`, `math`, `start`, `loop`, `autoSlide`, `outlineTitle` |
| `---` / `--` | Next slide / next slide in a vertical stack (becomes an outline section with `stack: true`) |
| `Note:` | Speaker notes to the end of the slide |
| `<!-- .slide: … -->` | Closed set: `id`, `layout`, `master`, `title`, `theme`, `transition`, `hidden`, `steps`, `background` and `background-*`, `tone`, `section`; reveal.js `data-background-*` and `data-transition` aliases are mapped |
| `<!-- .element: … -->` | On the element before it: `fragment[=effect]`, `step=n`, `tone`, `id`, media `width`/`height`/`overlay`, `avatar` |
| `layout="<id>"` + `:::` regions | Headings, paragraphs, lists, images, tables and `::: left`, `::: right`, `::: card {icon=…}`, `::: video {…}`, `::: chart` regions fill a catalog layout's props |
| `::: component <id> {…}` | A catalog component with a bounded JSON body; brace attributes `height`, `step`, `fragment`, `tone`, `#id` |
| `::: block <type>` | Any block family as a JSON body |
| `` ```ts [1-2\|4-6] `` | Code with highlight steps |
| `$$ … $$` | Block math (a `math` block, rendered as MathML); inline `$…$` stays text |

```ts
import { deckToMarkdown, parseDeckMarkdown } from '@texuli/deck/markdown';
import { validateDeckBlock } from '@texuli/slides/stage';

const result = parseDeckMarkdown(markdown, { validateBlock: validateDeckBlock });
// result.ok, result.deck (the same validated Deck as parseDeck), result.issues with line and column
const canonical = deckToMarkdown(result.deck); // supported features round-trip
```

## 3. Present with DeckStage

```svelte
<script lang="ts">
  import '@texuli/slides/styles.css';
  import '@texuli/player/styles.css';
  import { DeckStage } from '@texuli/slides/stage';

  let { deck }: { deck: unknown } = $props();
</script>

<DeckStage {deck} tier="untrusted" />
```

- `deck` takes any input `migrateDeck` understands; an invalid deck shows
  its diagnostics and is never painted (`onError` reports them).
  `prepareDeck(input)` runs the same check ahead of time.
- `tier` defaults to `untrusted`: the stage applies
  `@texuli/core/url-policy` to every link and media source at paint. Keep
  it for agent decks; the deck never carries its own trust tier.
- Fixed canvas (1280 × 720 for 16:9) scaled and letterboxed; `fit` is
  `container` (default) or `viewport`. `syncHash` (default on, first stage
  only) keeps `#/<slide>/<step>` deep links.
- Keys: arrows, Space, PageUp/PageDown, Home/End; `O` overview, `F`
  fullscreen, `S` or `P` presenter (notes, next slide, optional timer), `B`
  or `.` blackout, `L` laser, `?` help; swipe and click-to-advance.
  Interactive blocks and components keep their own keys.
- Seams: `renderers` (replace or extend layouts, components, backgrounds,
  custom slides), `plugins` (engine hooks), `messages` (every stage string),
  `sync` (presenter protocol across same-origin windows, no server),
  `controller` (bindable imperative API).
- Components load lazily per family; untrusted decks paint read-only except
  the interactive blocks. Mutating views (board, sortable, workflow edit,
  forms, embeds) need a host capability.

## 4. Print, PDF and PPTX

```ts
import { exportDeckPptx, planDeckPrint, requestDeckPdf } from '@texuli/slides/export';
import { prepareDeck } from '@texuli/slides/stage';

const prepared = prepareDeck(input);
if (prepared.ok) {
  const pptx = await exportDeckPptx(prepared.deck, { notes: true }); // { filename, blob, omitted }
  const plan = planDeckPrint(prepared.deck, { notes: 'appendix' }); // none | appendix | handout
  await requestDeckPdf(plan); // browser print dialog unless you pass an exporter
}
```

- Print: mount `DeckPrintView` (`deck`, `notes`, `onReady`) on a print route
  (the stage's print action opens `?print=1`) and call `window.print()` in
  `onReady`. Hidden slides are skipped; every step prints in its final state.
- PPTX v2 is built in the browser by an owned writer loaded on first use.
  Images need a host `loadImage` (the host applies its URL policy); charts
  need `snapshotChart`, else they are listed in `omitted` and on the notes
  page. Nothing is uploaded.

## 5. Agent tooling

With `@texuli/tools` installed, the `deck` command of the `texuli` bin (also
the `texuli-deck` bin, new in `0.4.0`) prints JSON and exits 1 when a deck
is invalid:

```bash
npx texuli deck capabilities
npx texuli deck schema
npx texuli deck layouts
npx texuli deck lint --file <deck.json>
npx texuli deck inspect --file <deck.json>
npx texuli deck from-markdown --file <deck.md>
npx texuli deck to-markdown --file <deck.json>
```

`capabilities` lists the format version, commands, layout ids, outlines and
templates; `schema` is the v2 JSON Schema; `layouts` prints every catalog
entry (props schema, sample, `useWhen`, `dontUseWhen`, pacing, limits);
`lint` adds quality warnings (missing or boilerplate notes, layout
repetition, too many words, unrevealed steps) to the model errors;
`inspect` summarizes slides and the outline. `--text <source>` or stdin
replace `--file`.

The MCP servers (`npx -y @texuli/mcp`, new in `0.9.0`; see
[`../../router/hosts.md`](../../router/hosts.md#mcp)) run the same commands
as the read-only `deck.run` tool: `deck.run { "command": "lint", "deck": {} }`
or `deck.run { "command": "from-markdown", "markdown": "…" }`. From `0.9.0`
the router also takes that JSON: `npx texuli deck run --file <input.json>`.

Agent loop: `capabilities` → pick layouts below → write JSON or Markdown →
`lint` until 0 errors → hand the deck to the developer, who paints it with
`DeckStage` at the `untrusted` tier.

## The 21 layout ids

From `DECK_LAYOUTS` (`@texuli/deck/model`): 20 catalog layouts with strict
props, plus `free`. Pick by `useWhen`; never use a layout for its
`dontUseWhen` case.

| Id | Main props | Use when | Not when |
| --- | --- | --- | --- |
| `title-hero` | `title`, `subtitle`, `meta` | The first slide: title, subtitle, speaker and event | Any slide but the cover |
| `section-divider` | `eyebrow`, `title` | Opening a new chapter or section | Carrying content |
| `two-column-split` | `left`, `right` | Two ideas side by side: before and after, problem and solution | Three or more items |
| `three-column-cards` | `cards` (3) | Three parallel concepts: pillars, features, principles | More or fewer than three |
| `image-left` | `image`, `heading`, `body` | Walking through a screenshot, photo or diagram with text | The image is the whole message |
| `image-right` | `image`, `heading`, `body` | The idea comes first and the image anchors it | The image must be read first |
| `image-centered` | `image`, `caption` | One diagram, screenshot or chart image is the point | The image needs text beside it |
| `image-full-bleed` | `image`, `caption`, `credit`, `overlay` | The image is the message: a hero photo or a quote on an image | Substantial text |
| `quote` | `quote`, `cite` | A short quote that earns its own slide | Unattributed, or past two lines |
| `code-with-callout` | `code`, `heading`, `bullets` | Explaining what a short piece of code does | The code is too long: trim it and step highlights |
| `big-stat` | `number`, `label`, `context`, `source` | One number makes the case | The trend matters more (use `chart`) |
| `comparison-table` | `columns`, `rows` | Comparing 2–4 options across 3–5 attributes | More than four options or five attributes |
| `process-steps` | `steps` | A 3–5 step process or workflow | More than five steps, or order does not matter |
| `timeline` | `events` | 4–8 dated events that form a story arc | Dates do not matter, or more than eight events |
| `team-avatars` | `people` | Introducing the team or co-presenters | More than eight people |
| `closing-cta` | `title`, `text`, `cta`, `footnote` | The final slide: what to do next and where to go | Mid-deck (use `section-divider`) |
| `video-centered` | `video`, `caption` | One demo, trailer or explainer clip is the point | The video needs text beside it |
| `video-left` | `video`, `heading`, `body` | Walking through a demo or clip with text | The video is the only focus |
| `video-right` | `video`, `heading`, `body` | The idea comes first and the clip shows it | The video must be watched first |
| `chart` | `spec`, `height`, `showTable` | A trend or distribution is clearer as a chart | One number makes the point (use `big-stat`) |
| `free` | `blocks`, `master` | No catalog layout fits; compose from blocks and components | A catalog layout already fits |

The `component` and `custom` slide kinds are not catalog layouts. Run the
`layouts` command for each entry's exact props, limits and a valid sample.

## Gates

```bash
pnpm vitest run packages/deck
pnpm vitest run packages/slides
pnpm --filter @texuli/deck typecheck
pnpm --filter @texuli/slides typecheck
```
