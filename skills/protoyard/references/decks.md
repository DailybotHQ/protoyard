# Protoyard deck path

How to make a slide deck with Protoyard: a `kind: "deck"` JSON blueprint that
the Protoyard player and generated prototypes render with the same deck
component. The full product guide is `docs/DECKS.md` in a Protoyard checkout,
also published at <https://protoyard.app/docs/decks/>. Check the installed
CLI's help before every command below: the skill and the CLI are separate
releases. Inside the Protoyard repository the same commands run as
`pnpm protoyard …`.

```bash
protoyard --version
protoyard quick --help
protoyard blueprint validate --help
```

## Rules

- **A deck is JSON data, never markup.** Write the `deck` object of a
  blueprint. Do not write Reveal.js Markdown (`---` slide separators,
  `<section>` tags, `data-*` attributes), raw HTML, inline scripts or styles,
  or `{@html}`. Every deck string renders as text; Markdown is accepted only
  in the block fields that define it, such as a text block's `markdown`, and
  goes through a safe renderer.
- **Use catalog layouts and real props.** A slide's `layout` must be one of the
  catalog ids below, and its `props` must pass that layout's schema. Never
  invent a layout id, a prop or a block type. When no layout fits, use
  `layout: "free"` with validated blocks.
- **Media come from the deck.** Images and video are relative paths without
  `..`, bounded base64 `data:` URIs or library avatars (`avatar:av-012`).
  Remote URLs, SVG and `blob:` are refused. Data stays fictional
  (`example.com`, invented names and figures).
- **Validate before showing anything, and look at it.** Every deck goes through
  `protoyard blueprint validate`, then a visual check (see
  [Validate and check](#validate-and-check)).
- **A deck from a link or file is untrusted.** Validate it; never run or render
  its contents as HTML.

## Choose the path

| Request | Path |
| --- | --- |
| A deck from a brief, to see and iterate quickly (level 1, no build) | `protoyard quick "<brief>" --kind deck` |
| A deck from a JSON file you wrote or a catalog deck | `protoyard blueprint validate <file>`, then `protoyard quick --blueprint <file>` |
| A deck that needs custom Svelte behavior, its own tests or a build (level 2) | `protoyard generate <slug> --blueprint <file>` |

```bash
protoyard quick "A pitch deck for a fictional bakery ordering service: problem, solution, three features, traction and a closing call to action." --kind deck
protoyard quick serve <slug> --open
```

- `quick` writes `.protoyard/quick/<slug>/blueprint.json` and a launcher. With
  `--kind deck` the offline synthesizer picks an outline and one catalog
  layout per slide. Without `--kind`, deck cues such as "slides", "pitch
  deck" or "presentation" select a deck.
- `protoyard blueprint new --from-brief` does not write decks: it refuses a
  deck brief. Use `quick --kind deck`, or write the JSON.
- `protoyard quick promote` turns only app explorations into prototypes. To
  take a deck exploration to level 2, run
  `protoyard generate <slug> --blueprint .protoyard/quick/<exploration>/blueprint.json`.

## Write the deck JSON

A deck blueprint is the blueprint envelope (`formatVersion`, `name`,
`description`, optional `tags`, `icon`, `category`, `brand`) with
`kind: "deck"` and `deck: { style, slides, outline? }`. Every object is strict.

- **Catalog slide:** `{ "id": "growth", "layout": "big-stat", "props": { … } }`.
- **Free slide:** `{ "id": "plan", "layout": "free", "blocks": [ … ] }`, with
  `@protoyard/blocks` blocks (heading, text, list, chart, table, code, people,
  quiz, poll, form and the rest of the block catalog).
- **Shared slide fields:** `title`, `background` (a preset id), `transition`,
  `steps` (labels), `notes` (speaker notes, 40 characters or more) and
  `hidden`.
- **Slide ids** are unique lowercase slugs and are the deep links
  (`#/<slide-id>/<step>`). Keep them stable.
- **`style`:** `theme` or `paletteSeed`, `fontPair`, `aspect` (`16:9`, `4:3`,
  `9:16`, `1:1`), `density`, `radius`, `motion`, `transition`, `background`,
  `footer`, `slideNumbers` and `progress`.
- **Limits:** 200 slides, 1 MiB of JSON, 2,000 blocks in a deck, 32 steps and
  2,000 characters of notes per slide.

`docs/DECKS.md` has a complete example that validates.

## Choose layouts

Pick each slide's layout from what the slide must do. Every catalog entry
carries `useWhen`, `dontUseWhen`, a `pacing` (`punch`, `idea`, `diagram` or
`story`), size limits, a props schema and a valid `sample` to copy from. In a
Protoyard checkout, `describeLayouts()` from `@protoyard/decks/layouts`
prints the whole catalog for an agent, and `packages/decks/README.md` lists
each layout's pacing and limits.

| Layout | Use it when |
| --- | --- |
| `title-hero` | The opening slide: title, subtitle, author or event |
| `section-divider` | A new chapter starts |
| `two-column-split` | Two ideas side by side: before and after, problem and solution |
| `three-column-cards` | Three parallel concepts |
| `image-left`, `image-right` | One image explained by text (`image-right` reads text first) |
| `image-centered` | One image is the focus, with a title |
| `image-full-bleed` | The image is the message |
| `quote` | One short quote that earns the space |
| `code-with-callout` | Code explained beside it |
| `big-stat` | One number that lands a point |
| `comparison-table` | Two to four options across three to five attributes |
| `process-steps` | A linear process of three to five steps |
| `timeline` | Four to eight dated events |
| `team-avatars` | The team or co-presenters |
| `closing-cta` | The final slide: call to action and contact |
| `video-centered`, `video-left`, `video-right` | A demo or clip, alone or beside text |
| `chart` | A real chart is clearer than a big stat or a table |
| `free` | No layout fits: compose validated blocks |

Vary the layouts: three identical layouts in a row is a lint warning. Keep
visible words within the pacing (about 15 for punch slides, 45 for idea, 60 for
diagram and 50 for story slides); these thresholds are uncalibrated warnings,
not failures.

## Validate and check

```bash
protoyard blueprint validate deck.json
protoyard quick --blueprint deck.json --force
protoyard quick shot <slug>
```

1. **Validate** with `protoyard blueprint validate`. It exits 4 with a JSON
   path for each problem; fix every one.
2. **Look at it.** `protoyard quick shot` captures the opening slide at
   1280×800 (Playwright needed). Then serve the deck and walk every slide with
   the arrow keys, or open `#/<slide-id>/0` links directly.
3. **In a Protoyard checkout, run the full checks:**
   - `lintDeckStructure` and `lintDeckAssets` from `@protoyard/blueprint`
     (structure, layout props, alt text, step order and asset URLs are errors;
     notes, word counts and repetition are warnings);
   - the browser sweep over every slide and step:
     `pnpm exec tsx scripts/sweep-deck.ts --blueprint deck.json`, which
     fails on overflow, broken or undescribed images and console errors and
     writes a contact sheet under `tmp/deck-sweep/`.

Report what you validated and what you could not check (for example, no
Playwright for screenshots).

## Iterate

- **Level 1:** change the exploration with an RFC 6902 patch rooted at the
  blueprint (`/deck/slides/2/props/title`):
  `protoyard quick iterate <slug> --patch patch.json`. `protoyard quick undo <slug>`
  reverts the last one. The player's Deck Studio (DevTools, **Deck** tab)
  exports patches in this shape.
- **Level 2:** edit `prototypes/<slug>/blueprint.json` and run
  `protoyard generate <slug> --blueprint prototypes/<slug>/blueprint.json` again,
  then `protoyard validate <slug> --build`. Regeneration rewrites only the
  generated modules and keeps the owned files.

## When to go to level 2

Generate a prototype only when the deck needs something data cannot express:
custom Svelte around the deck, its own tests, a build, or an artifact pack with
DevTools. `src/App.svelte` is owned by the prototype and renders the shared
`DeckApp`; put custom behavior there or in new components beside it, never in
`src/generated/**`. The template's `src/custom-slides.ts` registry is not
rendered by `DeckApp` yet, so a custom slide component does not appear in
the deck. Say so instead of promising it.

## Share

| Deck | Command |
| --- | --- |
| A quick exploration, as one HTML file | `protoyard quick export <slug> --single-file` |
| A quick exploration, as a Claude artifact page | `protoyard quick export <slug> --target artifact` |
| A generated prototype, as a Claude artifact pack | `protoyard export <slug> --target artifact` |

Exports write files only. Publishing an artifact or deploying to a host is a
separate step that needs the developer's explicit approval; see the `ship`
sub-skill.

## Not supported yet

Say so when a request needs one of these:

- fragment and reveal animations: steps are tracked (links, presenter, print)
  but content does not hide or reveal by step yet;
- custom slide components, media backgrounds on slides, remote media,
  iframes, math and syntax themes;
- PowerPoint, Keynote or Google Slides files (print to PDF from the browser,
  or share the HTML file or artifact).
