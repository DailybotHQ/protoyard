<!-- Generated from @protoyard/blocks/catalog. Do not edit by hand. -->

# Blocks reference

Authoring metadata for every block type in `@protoyard/blocks`. Agents, MCP and deck lint read `BLOCK_CATALOG` and `validateBlocksForAuthoring` instead of this prose. Runtime renderers never import the catalog subpath.

| Type | Family | Label | Use when | Limits |
| --- | --- | --- | --- | --- |
| `heading` | text | Heading | Open a section or slide with a clear title | text ≤ 200 characters; level 1–4; optional eyebrow and subtitle |
| `text` | text | Rich text | Paragraphs, short lists and inline emphasis in markdown | markdown ≤ 4000 characters; parsed by safe markdown (no raw HTML) |
| `list` | text | List | Bullets, numbers, checks or icon rows with short items | 12 items; item text ≤ 600 markdown |
| `quote` | text | Quote | A short testimonial or pull quote with optional cite and avatar | quote ≤ 600 characters; optional avatar id av-001…175 |
| `callout` | text | Callout | Highlight a warning, tip or note beside the main story | body ≤ 1,000 markdown; tone from the closed palette |
| `divider` | text | Divider | Separate sections visually with an optional label | optional label; variant line or space |
| `image` | media | Image | Show a local or embedded raster image with alt text | avatar:av-001…175, data: raster, or relative path; width/height 1–4096; no remote URLs |
| `video` | media | Video | Local or embedded short product clips | mp4/webm data or relative path; autoplay requires muted; label required |
| `people` | media | People | Team grids or speaker lists with fictional portraits | 1–24 people; avatar ids only |
| `stat` | data | Stats | KPI row with values, deltas and optional spark trends | 1–6 items; trend ≤ 60 points |
| `table` | data | Table | Small comparison tables with typed cells | caption required; ≤ 8 columns; ≤ 50 rows; formats text/number/percent/cents |
| `chart` | data | Chart | Bounded ChartSpec (line, area, bar, donut, pie, funnel) | ChartSpecSchema caps; optional accessible data table |
| `code` | code | Code | Short code samples with a closed language list | ≤ 20000 characters; ≤ 400 lines; ≤ 16 highlight steps |
| `timeline` | structure | Timeline | 2–12 ordered events along a path | 2–12 events |
| `steps` | structure | Steps | Short how-to sequences (2–8 steps) | 2–8 items |
| `comparison` | structure | Comparison | Side-by-side plan or feature matrices | 2–4 columns; ≤ 8 rows |
| `cards` | structure | Cards | Feature grids with title, body, icon or image | 1–12 cards; 2–4 columns |
| `icon` | structure | Icon | A single allow-listed icon with a label or decorative mark | allow-listed icon names; label or decorative: true |
| `cta` | structure | Call to action | One to three safe links as primary actions | 1–3 actions; http(s), mailto, # or relative href only |
| `columns` | structure | Columns | Side-by-side block groups on wide layouts | 2–4 columns; ≤ 12 blocks each; nest ≤ 3 deep |
| `tabs` | interactive | Tabs | 2–6 alternative panels the viewer can switch | id required; 2–6 panels; ≤ 12 blocks each |
| `reveal` | interactive | Reveal | Answers or details behind a button | id required; ≤ 12 nested blocks |
| `poll` | interactive | Poll | Live audience choices with local tallies | id required; 2–8 options; results after-vote/always/hidden |
| `quiz` | interactive | Quiz | Short self-checks with known answers | id required; 1–20 questions; 2–6 choices; seeded shuffle |
| `calculator` | interactive | Calculator | Interactive what-if math with a closed formula AST | id required; 1–8 inputs; 1–6 outputs; formula caps in ./formula |
| `counter` | interactive | Counter | Simple +/- tallies within min/max | id required; start/step/min/max bounds |
| `chart-controls` | interactive | Chart controls | Let viewers switch kind, series or range on one ChartSpec | id required; kinds 2–4; needs seriesToggle or range or kinds |
| `form` | interactive | Form | Collect structured fields; pages own responses | id required; 1–20 fields; closed field types; responses via @protoyard/pages |
| `map` | map | Map | Points and routes on the simulated basemap | id required; basemap port-meridian only; 1–200 points; route ≤ 50 |
| `embed-app` | embed | Embedded app | Mount a small opaque app blueprint inside a deck or page | id required; app ≤ 64 KB; depth ≤ 24; host validates with blueprint loader |

## Per-type notes

### `heading` — Heading

**Family:** text

**Use when**
- Open a section or slide with a clear title
- Mark hierarchy (H1–H4)

**Don't use when**
- Long body copy (use text)
- A single icon callout (use icon or callout)

**Limits**
- text ≤ 200 characters
- level 1–4
- optional eyebrow and subtitle

**Accessibility:** Rendered as a real heading level; keep a single H1 per slide or page when possible.

### `text` — Rich text

**Family:** text

**Use when**
- Paragraphs, short lists and inline emphasis in markdown

**Don't use when**
- A structured checklist with icons (use list)
- Executable HTML or scripts

**Limits**
- markdown ≤ 4000 characters
- parsed by safe markdown (no raw HTML)

**Accessibility:** Markdown becomes semantic elements; links keep visible labels; never {@html}.

### `list` — List

**Family:** text

**Use when**
- Bullets, numbers, checks or icon rows with short items

**Don't use when**
- Long narrative (use text)
- A multi-column feature grid (use cards)

**Limits**
- 12 items
- item text ≤ 600 markdown

**Accessibility:** Uses list markup; check style exposes done state in text, not color alone.

### `quote` — Quote

**Family:** text

**Use when**
- A short testimonial or pull quote with optional cite and avatar

**Don't use when**
- Long body copy
- A full person bio grid (use people)

**Limits**
- quote ≤ 600 characters
- optional avatar id av-001…175

**Accessibility:** Cite is associated with the quote; avatar is decorative when name is present.

### `callout` — Callout

**Family:** text

**Use when**
- Highlight a warning, tip or note beside the main story

**Don't use when**
- Primary title (use heading)
- Multiple competing CTAs

**Limits**
- body ≤ 1,000 markdown
- tone from the closed palette

**Accessibility:** Tone maps to theme tokens with contrast; icon is decorative when title exists.

### `divider` — Divider

**Family:** text

**Use when**
- Separate sections visually with an optional label

**Don't use when**
- As the only content on a slide

**Limits**
- optional label
- variant line or space

**Accessibility:** Decorative; label is plain text when present.

### `image` — Image

**Family:** media

**Use when**
- Show a local or embedded raster image with alt text

**Don't use when**
- Remote https images at level 1
- SVG or HTML markup as the source

**Limits**
- avatar:av-001…175, data: raster, or relative path
- width/height 1–4096
- no remote URLs

**Accessibility:** Requires alt text unless decorative: true; caption stays as visible text.

### `video` — Video

**Family:** media

**Use when**
- Local or embedded short product clips

**Don't use when**
- Remote streaming URLs
- Autoplay with sound

**Limits**
- mp4/webm data or relative path
- autoplay requires muted
- label required

**Accessibility:** Accessible name from label; autoplay is muted; controls remain available when set.

### `people` — People

**Family:** media

**Use when**
- Team grids or speaker lists with fictional portraits

**Don't use when**
- A single quote (use quote)
- Real PII or real people photos

**Limits**
- 1–24 people
- avatar ids only

**Accessibility:** Name is the primary label; avatar is supplementary.

### `stat` — Stats

**Family:** data

**Use when**
- KPI row with values, deltas and optional spark trends

**Don't use when**
- Full time-series charts (use chart)
- Editable metrics (use calculator)

**Limits**
- 1–6 items
- trend ≤ 60 points

**Accessibility:** Values and labels are text; delta tone is not the only signal (include words).

### `table` — Table

**Family:** data

**Use when**
- Small comparison tables with typed cells

**Don't use when**
- Huge datasets (cap is small by design)
- Charts of the same numbers alone

**Limits**
- caption required
- ≤ 8 columns
- ≤ 50 rows
- formats text/number/percent/cents

**Accessibility:** Caption names the table; numeric formats stay in data for screen readers.

### `chart` — Chart

**Family:** data

**Use when**
- Bounded ChartSpec (line, area, bar, donut, pie, funnel)

**Don't use when**
- Unvalidated chart JSON
- More than 8 series or 366 points

**Limits**
- ChartSpecSchema caps
- optional accessible data table

**Accessibility:** Prefer showTable for a data table; series colors come from theme tokens.

### `code` — Code

**Family:** code

**Use when**
- Short code samples with a closed language list

**Don't use when**
- Executable scripts
- Huge dumps over the line/char caps

**Limits**
- ≤ 20000 characters
- ≤ 400 lines
- ≤ 16 highlight steps

**Accessibility:** Presented as a code block with language; highlights are visual only.

### `timeline` — Timeline

**Family:** structure

**Use when**
- 2–12 ordered events along a path

**Don't use when**
- A single milestone (use stat or heading)
- Gantt-style project plans

**Limits**
- 2–12 events

**Accessibility:** Events read in order; time and title are both text.

### `steps` — Steps

**Family:** structure

**Use when**
- Short how-to sequences (2–8 steps)

**Don't use when**
- Branching flows (use product flow engine)
- Long docs

**Limits**
- 2–8 items

**Accessibility:** Numbered mode exposes order; icons are decorative beside titles.

### `comparison` — Comparison

**Family:** structure

**Use when**
- Side-by-side plan or feature matrices

**Don't use when**
- Free-form prose
- More than four columns

**Limits**
- 2–4 columns
- ≤ 8 rows

**Accessibility:** Row labels and cell values are text or boolean words, not color alone.

### `cards` — Cards

**Family:** structure

**Use when**
- Feature grids with title, body, icon or image

**Don't use when**
- A single CTA band (use cta)
- Dense data tables

**Limits**
- 1–12 cards
- 2–4 columns

**Accessibility:** Each card has a text title; images need imageAlt when present.

### `icon` — Icon

**Family:** structure

**Use when**
- A single allow-listed icon with a label or decorative mark

**Don't use when**
- Arbitrary SVG uploads
- Icon-only navigation without a name

**Limits**
- allow-listed icon names
- label or decorative: true

**Accessibility:** Provide label unless decorative; size does not replace the name.

### `cta` — Call to action

**Family:** structure

**Use when**
- One to three safe links as primary actions

**Don't use when**
- Long forms (use form)
- Unsafe javascript: links

**Limits**
- 1–3 actions
- http(s), mailto, # or relative href only

**Accessibility:** Buttons/links use visible labels; variants are not the only cue.

### `columns` — Columns

**Family:** structure

**Use when**
- Side-by-side block groups on wide layouts

**Don't use when**
- Deep nesting beyond three container levels
- As a substitute for tabs

**Limits**
- 2–4 columns
- ≤ 12 blocks each
- nest ≤ 3 deep

**Accessibility:** Reading order follows column then block order; avoid empty columns.

### `tabs` — Tabs

**Family:** interactive

**Use when**
- 2–6 alternative panels the viewer can switch

**Don't use when**
- Linear steps (use steps)
- SEO-critical content only in hidden panels

**Limits**
- id required
- 2–6 panels
- ≤ 12 blocks each

**Accessibility:** label names the tablist; selected panel is keyboard reachable.

### `reveal` — Reveal

**Family:** interactive

**Use when**
- Answers or details behind a button

**Don't use when**
- Critical content that must always be visible

**Limits**
- id required
- ≤ 12 nested blocks

**Accessibility:** Button label toggles open/closed; content stays in the accessibility tree when open.

### `poll` — Poll

**Family:** interactive

**Use when**
- Live audience choices with local tallies

**Don't use when**
- Real multiplayer voting backends
- Quizzes with right answers (use quiz)

**Limits**
- id required
- 2–8 options
- results after-vote/always/hidden

**Accessibility:** Question is the group label; selected options are announced; results not color-only.

### `quiz` — Quiz

**Family:** interactive

**Use when**
- Short self-checks with known answers

**Don't use when**
- Graded certification
- Open-ended essays

**Limits**
- id required
- 1–20 questions
- 2–6 choices
- seeded shuffle

**Accessibility:** Feedback text explains correctness; passScore is numeric, not color alone.

### `calculator` — Calculator

**Family:** interactive

**Use when**
- Interactive what-if math with a closed formula AST

**Don't use when**
- Executable JavaScript formulas
- Unbounded sliders

**Limits**
- id required
- 1–8 inputs
- 1–6 outputs
- formula caps in ./formula

**Accessibility:** Inputs have labels and units; outputs update as text values.

### `counter` — Counter

**Family:** interactive

**Use when**
- Simple +/- tallies within min/max

**Don't use when**
- Analytics metrics (use stat)
- Multi-input math (use calculator)

**Limits**
- id required
- start/step/min/max bounds

**Accessibility:** Value is a live text readout; controls are real buttons with names.

### `chart-controls` — Chart controls

**Family:** interactive

**Use when**
- Let viewers switch kind, series or range on one ChartSpec

**Don't use when**
- Static charts (use chart)
- Incompatible kind lists

**Limits**
- id required
- kinds 2–4
- needs seriesToggle or range or kinds

**Accessibility:** Controls are labeled; chart updates keep an optional data table.

### `form` — Form

**Family:** interactive

**Use when**
- Collect structured fields; pages own responses

**Don't use when**
- Auth or real PII pipelines
- More than 20 fields

**Limits**
- id required
- 1–20 fields
- closed field types
- responses via @protoyard/pages

**Accessibility:** Each field has a label; errors map to fields; success message is text.

### `map` — Map

**Family:** map

**Use when**
- Points and routes on the simulated basemap

**Don't use when**
- Real tile servers or GPS tracking
- More than 200 points

**Limits**
- id required
- basemap port-meridian only
- 1–200 points
- route ≤ 50

**Accessibility:** label names the map; points expose text labels (not color alone).

### `embed-app` — Embedded app

**Family:** embed

**Use when**
- Mount a small opaque app blueprint inside a deck or page

**Don't use when**
- Unvalidated remote iframes
- Full product shells as embeds

**Limits**
- id required
- app ≤ 64 KB
- depth ≤ 24
- host validates with blueprint loader

**Accessibility:** title names the embed; start control is a real button; nested app keeps its own a11y.

