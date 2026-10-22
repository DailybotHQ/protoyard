<!-- BEGIN GENERATED BLOCK CATALOG: keep this region in sync with renderBlockCatalogMarkdown(). -->
<!-- Generated from @protoyard/blocks/catalog. Do not edit by hand. -->

# Blocks reference

Authoring metadata for every block type in `@protoyard/blocks`. Agents, MCP and deck lint read `BLOCK_CATALOG` and `validateBlocksForAuthoring` instead of this prose. Runtime renderers never import the catalog subpath.

Every block may also carry `id`, `step`, `reveal`, `tone` (optional; interactive blocks require `id`). Props below are read from the zod schemas: `name?` is optional, and `{ a; b? }` lists the keys of a nested object.

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
| `cta` | structure | Call to action | One to three safe links as primary actions | 1–3 actions; https, mailto or #section href only |
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
| `flow` | diagram | Flow diagram | Show a short process or chain of steps as connected nodes | 1–12 nodes; labels ≤ 120 characters; unique node ids |
| `tree` | diagram | Tree diagram | A file tree or an org chart | 1–64 nodes; depth ≤ 6; every parentId must exist; no cycles |
| `board` | diagram | Board diagram | A static kanban-style snapshot of work by column | 1–6 columns; ≤ 8 cards per column; unique column and card ids |
| `terminal` | diagram | Terminal | Show a command-line session: prompts, output and comments | 1–40 lines; line text ≤ 240 characters; kinds: prompt, output, comment |

## Per-type notes

### `heading` — Heading

**Family:** text

**Use when**
- Open a section or slide with a clear title
- Mark hierarchy (H1–H4)

**Don't use when**
- Long body copy (use text)
- A single icon callout (use icon or callout)

**Props**
- `text`: string
- `level?`: number
- `eyebrow?`: string
- `subtitle?`: string
- `align?`: "start" \| "center"

**Limits**
- text ≤ 200 characters
- level 1–4
- optional eyebrow and subtitle

**Accessibility:** Rendered as a real heading level; keep a single H1 per slide or page when possible.

**Minimal example**

```json
{
  "type": "heading",
  "text": "Hi"
}
```

### `text` — Rich text

**Family:** text

**Use when**
- Paragraphs, short lists and inline emphasis in markdown

**Don't use when**
- A structured checklist with icons (use list)
- Executable HTML or scripts

**Props**
- `markdown`: string
- `size?`: "sm" \| "md" \| "lg"
- `align?`: "start" \| "center"

**Limits**
- markdown ≤ 4000 characters
- parsed by safe markdown (no raw HTML)

**Accessibility:** Markdown becomes semantic elements; links keep visible labels; never {@html}.

**Minimal example**

```json
{
  "type": "text",
  "markdown": "Hello"
}
```

### `list` — List

**Family:** text

**Use when**
- Bullets, numbers, checks or icon rows with short items

**Don't use when**
- Long narrative (use text)
- A multi-column feature grid (use cards)

**Props**
- `style?`: "bullet" \| "number" \| "check" \| "icon"
- `items`: { text; icon?; done? }[]

**Limits**
- 12 items
- item text ≤ 600 markdown

**Accessibility:** Uses list markup; check style exposes done state in text, not color alone.

**Minimal example**

```json
{
  "type": "list",
  "items": [
    {
      "text": "One item"
    }
  ]
}
```

### `quote` — Quote

**Family:** text

**Use when**
- A short testimonial or pull quote with optional cite and avatar

**Don't use when**
- Long body copy
- A full person bio grid (use people)

**Props**
- `quote`: string
- `cite?`: string
- `role?`: string
- `avatar?`: string

**Limits**
- quote ≤ 600 characters
- optional avatar id av-001…175

**Accessibility:** Cite is associated with the quote; avatar is decorative when name is present.

**Minimal example**

```json
{
  "type": "quote",
  "quote": "Keep it short."
}
```

### `callout` — Callout

**Family:** text

**Use when**
- Highlight a warning, tip or note beside the main story

**Don't use when**
- Primary title (use heading)
- Multiple competing CTAs

**Props**
- `title?`: string
- `body`: string
- `icon?`: enum (96 values)

**Limits**
- body ≤ 1,000 markdown
- tone from the closed palette

**Accessibility:** Tone maps to theme tokens with contrast; icon is decorative when title exists.

**Minimal example**

```json
{
  "type": "callout",
  "body": "Note"
}
```

### `divider` — Divider

**Family:** text

**Use when**
- Separate sections visually with an optional label

**Don't use when**
- As the only content on a slide

**Props**
- `label?`: string
- `variant?`: "line" \| "space"

**Limits**
- optional label
- variant line or space

**Accessibility:** Decorative; label is plain text when present.

**Minimal example**

```json
{
  "type": "divider"
}
```

### `image` — Image

**Family:** media

**Use when**
- Show a local or embedded raster image with alt text

**Don't use when**
- Remote https images at level 1
- SVG or HTML markup as the source

**Props**
- `src`: string
- `alt?`: string
- `decorative?`: boolean
- `width`: number
- `height`: number
- `caption?`: string
- `credit?`: string
- `fit?`: "contain" \| "cover"

**Limits**
- avatar:av-001…175, data: raster, or relative path
- width/height 1–4096
- no remote URLs

**Accessibility:** Requires alt text unless decorative: true; caption stays as visible text.

**Minimal example**

```json
{
  "type": "image",
  "src": "assets/cover.webp",
  "alt": "Cover",
  "width": 1,
  "height": 1
}
```

### `video` — Video

**Family:** media

**Use when**
- Local or embedded short product clips

**Don't use when**
- Remote streaming URLs
- Autoplay with sound

**Props**
- `src`: string
- `label`: string
- `poster?`: string
- `width`: number
- `height`: number
- `caption?`: string
- `autoplay?`: boolean
- `loop?`: boolean
- `muted?`: boolean
- `controls?`: boolean

**Limits**
- mp4/webm data or relative path
- autoplay requires muted
- label required

**Accessibility:** Accessible name from label; autoplay is muted; controls remain available when set.

**Minimal example**

```json
{
  "type": "video",
  "src": "./clips/demo.mp4",
  "label": "Demo",
  "width": 16,
  "height": 9
}
```

### `people` — People

**Family:** media

**Use when**
- Team grids or speaker lists with fictional portraits

**Don't use when**
- A single quote (use quote)
- Real PII or real people photos

**Props**
- `title?`: string
- `layout?`: "grid" \| "row"
- `people`: { name; role?; avatar?; bio? }[]

**Limits**
- 1–24 people
- avatar ids only

**Accessibility:** Name is the primary label; avatar is supplementary.

**Minimal example**

```json
{
  "type": "people",
  "people": [
    {
      "name": "Ada Example"
    }
  ]
}
```

### `stat` — Stats

**Family:** data

**Use when**
- KPI row with values, deltas and optional spark trends

**Don't use when**
- Full time-series charts (use chart)
- Editable metrics (use calculator)

**Props**
- `title?`: string
- `items`: { value; label; delta?; deltaTone?; context?; trend? }[]
- `source?`: string

**Limits**
- 1–6 items
- trend ≤ 60 points

**Accessibility:** Values and labels are text; delta tone is not the only signal (include words).

**Minimal example**

```json
{
  "type": "stat",
  "items": [
    {
      "value": "12",
      "label": "Items"
    }
  ]
}
```

### `table` — Table

**Family:** data

**Use when**
- Small comparison tables with typed cells

**Don't use when**
- Huge datasets (cap is small by design)
- Charts of the same numbers alone

**Props**
- `caption`: string
- `currency?`: string
- `columns`: { label; align?; format? }[]
- `rows`: ((string \| number \| null)[])[]
- `highlightRow?`: number

**Limits**
- caption required
- ≤ 8 columns
- ≤ 50 rows
- formats text/number/percent/cents

**Accessibility:** Caption names the table; numeric formats stay in data for screen readers.

**Minimal example**

```json
{
  "type": "table",
  "caption": "Plans",
  "columns": [
    {
      "label": "Name"
    }
  ],
  "rows": [
    [
      "Starter"
    ]
  ]
}
```

### `chart` — Chart

**Family:** data

**Use when**
- Bounded ChartSpec (line, area, bar, donut, pie, funnel)

**Don't use when**
- Unvalidated chart JSON
- More than 8 series or 366 points

**Props**
- `spec`: { kind; title; description?; unit?; currency?; labels; series }
- `height?`: "sm" \| "md" \| "lg"
- `showTable?`: boolean

**Limits**
- ChartSpecSchema caps
- optional accessible data table

**Accessibility:** Prefer showTable for a data table; series colors come from theme tokens.

**Minimal example**

```json
{
  "type": "chart",
  "spec": {
    "kind": "bar",
    "title": "Count",
    "labels": [
      "A"
    ],
    "series": [
      {
        "label": "n",
        "values": [
          1
        ]
      }
    ]
  }
}
```

### `code` — Code

**Family:** code

**Use when**
- Short code samples with a closed language list

**Don't use when**
- Executable scripts
- Huge dumps over the line/char caps

**Props**
- `code`: string
- `lang`: enum (10 values)
- `filename?`: string
- `caption?`: string
- `lineNumbers?`: boolean
- `highlights?`: string[]

**Limits**
- ≤ 20000 characters
- ≤ 400 lines
- ≤ 16 highlight steps

**Accessibility:** Presented as a code block with language; highlights are visual only.

**Minimal example**

```json
{
  "type": "code",
  "code": "x",
  "lang": "text"
}
```

### `timeline` — Timeline

**Family:** structure

**Use when**
- 2–12 ordered events along a path

**Don't use when**
- A single milestone (use stat or heading)
- Gantt-style project plans

**Props**
- `title?`: string
- `orientation?`: "horizontal" \| "vertical"
- `events`: { time; title; body?; icon?; tone? }[]

**Limits**
- 2–12 events

**Accessibility:** Events read in order; time and title are both text.

**Minimal example**

```json
{
  "type": "timeline",
  "events": [
    {
      "time": "2024",
      "title": "Start"
    },
    {
      "time": "2026",
      "title": "Now"
    }
  ]
}
```

### `steps` — Steps

**Family:** structure

**Use when**
- Short how-to sequences (2–8 steps)

**Don't use when**
- Branching flows (use product flow engine)
- Long docs

**Props**
- `title?`: string
- `numbered?`: boolean
- `items`: { title; body?; icon? }[]

**Limits**
- 2–8 items

**Accessibility:** Numbered mode exposes order; icons are decorative beside titles.

**Minimal example**

```json
{
  "type": "steps",
  "items": [
    {
      "title": "One"
    },
    {
      "title": "Two"
    }
  ]
}
```

### `comparison` — Comparison

**Family:** structure

**Use when**
- Side-by-side plan or feature matrices

**Don't use when**
- Free-form prose
- More than four columns

**Props**
- `title?`: string
- `columns`: { label; highlight? }[]
- `rows`: { label; values }[]

**Limits**
- 2–4 columns
- ≤ 8 rows

**Accessibility:** Row labels and cell values are text or boolean words, not color alone.

**Minimal example**

```json
{
  "type": "comparison",
  "columns": [
    {
      "label": "A"
    },
    {
      "label": "B"
    }
  ],
  "rows": [
    {
      "label": "Speed",
      "values": [
        "Fast",
        "Slow"
      ]
    }
  ]
}
```

### `cards` — Cards

**Family:** structure

**Use when**
- Feature grids with title, body, icon or image

**Don't use when**
- A single CTA band (use cta)
- Dense data tables

**Props**
- `title?`: string
- `columns?`: 2 \| 3 \| 4
- `items`: { title; eyebrow?; body?; icon?; image?; imageAlt?; href?; tone? }[]

**Limits**
- 1–12 cards
- 2–4 columns

**Accessibility:** Each card has a text title; images need imageAlt when present.

**Minimal example**

```json
{
  "type": "cards",
  "items": [
    {
      "title": "Card"
    }
  ]
}
```

### `icon` — Icon

**Family:** structure

**Use when**
- A single allow-listed icon with a label or decorative mark

**Don't use when**
- Arbitrary SVG uploads
- Icon-only navigation without a name

**Props**
- `icon`: enum (96 values)
- `label?`: string
- `decorative?`: boolean
- `size?`: "sm" \| "md" \| "lg" \| "xl"

**Limits**
- allow-listed icon names
- label or decorative: true

**Accessibility:** Provide label unless decorative; size does not replace the name.

**Minimal example**

```json
{
  "type": "icon",
  "icon": "star",
  "decorative": true
}
```

### `cta` — Call to action

**Family:** structure

**Use when**
- One to three safe links as primary actions

**Don't use when**
- Long forms (use form)
- Unsafe javascript: links

**Props**
- `title?`: string
- `body?`: string
- `actions`: { label; href; variant?; icon? }[]
- `footnote?`: string

**Limits**
- 1–3 actions
- https, mailto or #section href only

**Accessibility:** Buttons/links use visible labels; variants are not the only cue.

**Minimal example**

```json
{
  "type": "cta",
  "actions": [
    {
      "label": "Open",
      "href": "https://example.com"
    }
  ]
}
```

### `columns` — Columns

**Family:** structure

**Use when**
- Side-by-side block groups on wide layouts

**Don't use when**
- Deep nesting beyond three container levels
- As a substitute for tabs

**Props**
- `widths?`: "equal" \| "wide-start" \| "wide-end"
- `align?`: "start" \| "center"
- `columns`: block[][]

**Limits**
- 2–4 columns
- ≤ 12 blocks each
- nest ≤ 3 deep

**Accessibility:** Reading order follows column then block order; avoid empty columns.

**Minimal example**

```json
{
  "type": "columns",
  "columns": [
    [
      {
        "type": "text",
        "markdown": "Left"
      }
    ],
    [
      {
        "type": "text",
        "markdown": "Right"
      }
    ]
  ]
}
```

### `tabs` — Tabs

**Family:** interactive

**Use when**
- 2–6 alternative panels the viewer can switch

**Don't use when**
- Linear steps (use steps)
- SEO-critical content only in hidden panels

**Props**
- `id`: string
- `label`: string
- `panels`: { id; label; icon?; blocks }[]
- `defaultPanel?`: string

**Limits**
- id required
- 2–6 panels
- ≤ 12 blocks each

**Accessibility:** label names the tablist; selected panel is keyboard reachable.

**Minimal example**

```json
{
  "type": "tabs",
  "id": "tabs-min",
  "label": "Tabs",
  "panels": [
    {
      "id": "a",
      "label": "A",
      "blocks": [
        {
          "type": "text",
          "markdown": "A"
        }
      ]
    },
    {
      "id": "b",
      "label": "B",
      "blocks": [
        {
          "type": "divider"
        }
      ]
    }
  ]
}
```

### `reveal` — Reveal

**Family:** interactive

**Use when**
- Answers or details behind a button

**Don't use when**
- Critical content that must always be visible

**Props**
- `id`: string
- `label`: string
- `openLabel?`: string
- `blocks`: block[]
- `open?`: boolean

**Limits**
- id required
- ≤ 12 nested blocks

**Accessibility:** Button label toggles open/closed; content stays in the accessibility tree when open.

**Minimal example**

```json
{
  "type": "reveal",
  "id": "reveal-min",
  "label": "Show",
  "blocks": [
    {
      "type": "text",
      "markdown": "Hidden"
    }
  ]
}
```

### `poll` — Poll

**Family:** interactive

**Use when**
- Live audience choices with local tallies

**Don't use when**
- Real multiplayer voting backends
- Quizzes with right answers (use quiz)

**Props**
- `id`: string
- `question`: string
- `options`: { id; label }[]
- `maxChoices?`: number
- `results?`: "after-vote" \| "always" \| "hidden"

**Limits**
- id required
- 2–8 options
- results after-vote/always/hidden

**Accessibility:** Question is the group label; selected options are announced; results not color-only.

**Minimal example**

```json
{
  "type": "poll",
  "id": "poll-min",
  "question": "Pick one",
  "options": [
    {
      "id": "yes",
      "label": "Yes"
    },
    {
      "id": "no",
      "label": "No"
    }
  ]
}
```

### `quiz` — Quiz

**Family:** interactive

**Use when**
- Short self-checks with known answers

**Don't use when**
- Graded certification
- Open-ended essays

**Props**
- `id`: string
- `title?`: string
- `questions`: { id; prompt; choices; answers; explanation? }[]
- `feedback?`: "immediate" \| "end"
- `passScore?`: number
- `shuffle?`: boolean

**Limits**
- id required
- 1–20 questions
- 2–6 choices
- seeded shuffle

**Accessibility:** Feedback text explains correctness; passScore is numeric, not color alone.

**Minimal example**

```json
{
  "type": "quiz",
  "id": "quiz-min",
  "questions": [
    {
      "id": "q1",
      "prompt": "One?",
      "choices": [
        {
          "id": "a",
          "label": "A"
        },
        {
          "id": "b",
          "label": "B"
        }
      ],
      "answers": [
        "a"
      ]
    }
  ]
}
```

### `calculator` — Calculator

**Family:** interactive

**Use when**
- Interactive what-if math with a closed formula AST

**Don't use when**
- Executable JavaScript formulas
- Unbounded sliders

**Props**
- `id`: string
- `title?`: string
- `description?`: string
- `currency?`: string
- `inputs`: { name; label; control?; min; max; step?; default; unit?; help? }[]
- `outputs`: { id; label; formula; unit?; emphasis?; tone? }[]
- `chart?`: { output; input; kind?; points? }

**Limits**
- id required
- 1–8 inputs
- 1–6 outputs
- formula caps in ./formula

**Accessibility:** Inputs have labels and units; outputs update as text values.

**Minimal example**

```json
{
  "type": "calculator",
  "id": "calc-min",
  "inputs": [
    {
      "name": "x",
      "label": "X",
      "min": 0,
      "max": 10,
      "step": 1,
      "default": 1
    }
  ],
  "outputs": [
    {
      "id": "y",
      "label": "Y",
      "formula": {
        "op": "var",
        "name": "x"
      }
    }
  ]
}
```

### `counter` — Counter

**Family:** interactive

**Use when**
- Simple +/- tallies within min/max

**Don't use when**
- Analytics metrics (use stat)
- Multi-input math (use calculator)

**Props**
- `id`: string
- `step?`: number
- `label`: string
- `start?`: number
- `min?`: number
- `max?`: number
- `unit?`: string

**Limits**
- id required
- start/step/min/max bounds

**Accessibility:** Value is a live text readout; controls are real buttons with names.

**Minimal example**

```json
{
  "type": "counter",
  "id": "counter-min",
  "label": "Count"
}
```

### `chart-controls` — Chart controls

**Family:** interactive

**Use when**
- Let viewers switch kind, series or range on one ChartSpec

**Don't use when**
- Static charts (use chart)
- Incompatible kind lists

**Props**
- `id`: string
- `spec`: { kind; title; description?; unit?; currency?; labels; series }
- `kinds?`: ("line" \| "area" \| "bar" \| "donut" \| "pie" \| "funnel")[]
- `seriesToggle?`: boolean
- `range?`: boolean
- `height?`: "sm" \| "md" \| "lg"

**Limits**
- id required
- kinds 2–4
- needs seriesToggle or range or kinds

**Accessibility:** Controls are labeled; chart updates keep an optional data table.

**Minimal example**

```json
{
  "type": "chart-controls",
  "id": "cc-min",
  "spec": {
    "kind": "line",
    "title": "Trend",
    "labels": [
      "a",
      "b",
      "c"
    ],
    "series": [
      {
        "label": "One",
        "values": [
          1,
          2,
          3
        ]
      },
      {
        "label": "Two",
        "values": [
          2,
          2,
          4
        ]
      }
    ]
  },
  "seriesToggle": true
}
```

### `form` — Form

**Family:** interactive

**Use when**
- Collect structured fields; pages own responses

**Don't use when**
- Auth or real PII pipelines
- More than 20 fields

**Props**
- `id`: string
- `title?`: string
- `description?`: string
- `fields`: object[]
- `submitLabel`: string
- `successMessage`: string

**Limits**
- id required
- 1–20 fields
- closed field types
- responses via @protoyard/pages

**Accessibility:** Each field has a label; errors map to fields; success message is text.

**Minimal example**

```json
{
  "type": "form",
  "id": "form-min",
  "fields": [
    {
      "name": "email",
      "label": "Email",
      "type": "email"
    }
  ],
  "submitLabel": "Submit",
  "successMessage": "Thanks."
}
```

### `map` — Map

**Family:** map

**Use when**
- Points and routes on the simulated basemap

**Don't use when**
- Real tile servers or GPS tracking
- More than 200 points

**Props**
- `id`: string
- `label`: string
- `title?`: string
- `basemap?`: "port-meridian"
- `points`: { id; label; lng; lat; description?; icon?; tone? }[]
- `route?`: string[]

**Limits**
- id required
- basemap port-meridian only
- 1–200 points
- route ≤ 50

**Accessibility:** label names the map; points expose text labels (not color alone).

**Minimal example**

```json
{
  "type": "map",
  "id": "map-min",
  "label": "Map",
  "basemap": "port-meridian",
  "points": [
    {
      "id": "p1",
      "label": "Pier",
      "lng": 0,
      "lat": 0
    }
  ]
}
```

### `embed-app` — Embedded app

**Family:** embed

**Use when**
- Mount a small opaque app blueprint inside a deck or page

**Don't use when**
- Unvalidated remote iframes
- Full product shells as embeds

**Props**
- `id`: string
- `title`: string
- `startLabel?`: string
- `height?`: "sm" \| "md" \| "lg"
- `app`: object

**Limits**
- id required
- app ≤ 64 KB
- depth ≤ 24
- host validates with blueprint loader

**Accessibility:** title names the embed; start control is a real button; nested app keeps its own a11y.

**Minimal example**

```json
{
  "type": "embed-app",
  "id": "embed-min",
  "title": "Try it",
  "app": {
    "formatVersion": 1,
    "name": "Mini tracker",
    "entities": [
      {
        "name": "task",
        "plural": "tasks",
        "titleField": "title",
        "fields": [
          {
            "name": "title",
            "kind": "text",
            "required": true
          }
        ]
      }
    ],
    "roles": [
      {
        "name": "member",
        "permissions": {
          "*": [
            "*"
          ]
        }
      }
    ]
  }
}
```

### `flow` — Flow diagram

**Family:** diagram

**Use when**
- Show a short process or chain of steps as connected nodes
- Explain a loop (set loopBack)

**Don't use when**
- More than 12 steps (split it)
- Numbered prose steps (use steps)

**Props**
- `nodes`: { id; label; tone? }[]
- `loopBack?`: boolean

**Limits**
- 1–12 nodes
- labels ≤ 120 characters
- unique node ids

**Accessibility:** Rendered as an ordered list of nodes with arrows as decoration; order carries the meaning.

**Minimal example**

```json
{
  "type": "flow",
  "nodes": [
    {
      "id": "idea",
      "label": "Idea"
    },
    {
      "id": "ship",
      "label": "Ship"
    }
  ]
}
```

### `tree` — Tree diagram

**Family:** diagram

**Use when**
- A file tree or an org chart
- Hierarchy that is at most 6 levels deep

**Don't use when**
- Flat lists (use list)
- Graphs with cycles (not supported)

**Props**
- `style`: "file-tree" \| "org"
- `nodes`: { id; parentId; label; tone? }[]

**Limits**
- 1–64 nodes
- depth ≤ 6
- every parentId must exist; no cycles

**Accessibility:** Rendered as nested lists so the hierarchy is announced; tone never carries meaning alone.

**Minimal example**

```json
{
  "type": "tree",
  "style": "file-tree",
  "nodes": [
    {
      "id": "root",
      "parentId": null,
      "label": "src"
    }
  ]
}
```

### `board` — Board diagram

**Family:** diagram

**Use when**
- A static kanban-style snapshot of work by column

**Don't use when**
- A live, editable board (use a level-2 board view)
- More than 6 columns

**Props**
- `columns`: { id; title; cards }[]

**Limits**
- 1–6 columns
- ≤ 8 cards per column
- unique column and card ids

**Accessibility:** Each column is a labelled list; card tone is decorative and backed by text.

**Minimal example**

```json
{
  "type": "board",
  "columns": [
    {
      "id": "todo",
      "title": "To do",
      "cards": []
    }
  ]
}
```

### `terminal` — Terminal

**Family:** diagram

**Use when**
- Show a command-line session: prompts, output and comments

**Don't use when**
- Source code with highlighting (use code)
- Real secrets or real hosts

**Props**
- `lines`: { kind; text }[]

**Limits**
- 1–40 lines
- line text ≤ 240 characters
- kinds: prompt, output, comment

**Accessibility:** Rendered as preformatted text in a focusable, labelled region; prompts are marked in text.

**Minimal example**

```json
{
  "type": "terminal",
  "lines": [
    {
      "kind": "prompt",
      "text": "pnpm test"
    }
  ]
}
```

<!-- END GENERATED BLOCK CATALOG -->

## Authoring and rendering blocks

Protoyard decks, pages and documents share the same JSON block vocabulary. A
block is content data: it is validated against the closed schemas and is never
executed as code or rendered as HTML. Blueprint files, shared blueprint data,
and restored snapshots are untrusted input even when they came from a known
author. Keep validation at the boundary where data enters the app.

### Choose a block family

Most blocks display authored content: text (`heading`, `text`, `list`, `quote`,
`callout`, `divider`), media (`image`, `video`, `people`), data (`stat`,
`table`, `chart`), structure (`timeline`, `steps`, `comparison`, `cards`,
`icon`, `cta`), code, and static diagrams (`flow`, `tree`, `board`,
`terminal`). `columns` arranges child blocks. These blocks do not create
viewer-editable application state.

Interactive controls are `tabs`, `reveal`, `poll`, `quiz`, `calculator`,
`counter`, `chart-controls`, and `form`. The form block collects simulated
values; `@protoyard/pages` owns response records. `map` is a simulated map view,
and `embed-app` mounts a bounded app blueprint supplied by its host. They are
hosted content, not arbitrary embedded HTML. Every stateful or hosted block
requires a stable `id`; the closed list is exported as `STATEFUL_BLOCK_TYPES`,
with the remaining types in `STATIC_BLOCK_TYPES`.

Use the generated catalog above for each type's `useWhen`, `dontUseWhen`,
limits and accessibility guidance. It is rendered from `BLOCK_CATALOG`; do not
edit its contents by hand. The family and type lists are exported from
`@protoyard/blocks` (`BLOCK_TYPES` and `BLOCK_TYPE_FAMILY`).

### Validate before rendering

Use the schema parser for plain block data. It rejects unknown fields, invalid
types and duplicate ids and returns structured paths for errors:

```ts
import { safeParseBlocks } from '@protoyard/blocks';

const blocks: unknown = [
  { type: 'heading', text: 'Launch plan', level: 1 },
  { type: 'text', markdown: 'A **bounded** outline with useful detail.' },
  { type: 'cta', actions: [{ label: 'Read the details', href: 'https://example.com/details' }] },
];
const result = safeParseBlocks(blocks);
if (!result.success) {
  for (const issue of result.issues) {
    console.error(issue.jsonPath, issue.message);
  }
}
```

For an external JSON string or object, use `parseUntrustedBlocks` instead. It
applies the document limits before parsing: 1 MiB of JSON, depth 12, up to
2,000 blocks, and the media caps in `BLOCK_LIMITS`. It normalizes CRLF,
removes unsafe control and bidirectional characters, rejects prototype-related
keys, and reports path-addressed issues with fix hints. Caller-provided limits
can be lowered but not raised. Schema validation does not make external data
trusted; keep it inert after parsing too.

### Text, links and media safety

Rich text is bounded Markdown, not HTML. The `text.markdown`, `callout.body`,
and related Markdown fields are parsed at render time by the safe parser from
`@protoyard/ai/markdown`; raw HTML is not part of the format. Do not pass block
fields to `{@html}`, `innerHTML`, an evaluator, or a code execution API.
Code blocks display text through the small tokenizer in `@protoyard/blocks/code`;
highlighted tokens remain text.

Links in CTAs and cards use the exported `LinkHrefSchema`: supported values are
HTTPS, `mailto:` and same-document fragments (`#section`, `#/route`). HTTP,
relative paths, script/data/file, protocol-relative, and other unsupported
schemes are rejected rather than rewritten. In a document, a `#fragment` must
also name a block id that exists. See [SECURITY](SECURITY.md#kinds-hostile-decks-pages-and-docs).

Image and video sources use the media schemas. Level 1 permits fictional
avatar ids and bounded raster data URIs; it does not load remote media. Relative
asset paths are for level 2 and still pass the host's asset checks. SVG, remote
URLs, root-absolute paths, backslashes and parent-directory segments are
rejected. Images require alternative text unless marked decorative, and video
requires a label; autoplay must be muted. Keep captions and labels visible so
meaning is not carried only by an image, icon, or color.

### Lazy rendering boundary

`@protoyard/blocks-ui` exposes a small root dispatcher and separate family
subpaths. `BlockRenderer` checks data again at the rendering boundary, loads
the family renderer asynchronously, shows a loading state, and uses a bounded
note for invalid or unsupported blocks. Import only the family a custom host
needs; do not pull family renderers into `@protoyard/ui`'s shared barrel.

| Subpath | Family |
| --- | --- |
| `@protoyard/blocks-ui/text` | Headings, rich text, lists, quotes, callouts and dividers |
| `@protoyard/blocks-ui/media` | Images, video and fictional people/avatars |
| `@protoyard/blocks-ui/data` | Stats, tables and charts |
| `@protoyard/blocks-ui/structure` | Timelines, steps, comparison, cards, icons, CTAs and columns |
| `@protoyard/blocks-ui/code` | Code with stepped highlighting |
| `@protoyard/blocks-ui/diagram` | Flow, tree, board and terminal |
| `@protoyard/blocks-ui/interactive` | Poll, quiz, calculator, tabs/reveal, counter and chart controls |
| `@protoyard/blocks-ui/map` | Offline simulated map |
| `@protoyard/blocks-ui/embed` | Host-mounted app blueprint |

The root entry does not statically import family renderers, and none of these
families belong in the `@protoyard/ui` barrel. This keeps a host's reachable
graph limited to the families it renders.

### Interactive state and accessibility

Renderers do not write database rows. Stateful controls read and dispatch
through the `BlockStateHost` contract from `@protoyard/blocks/interactive`,
keyed by `<documentId>/<blockId>`. The kind runtime supplies a service-backed
host that validates actions and persists them; `createMemoryBlockStateHost()`
is for previews and tests. State and restored snapshots remain untrusted and
are validated against the current block definition.

The catalog's `a11y` entry documents each block's expectations. Preserve
semantic headings, lists, captions and labels; provide image alternatives;
make controls operable by keyboard; and never use color as the only signal.
Interactive actions should expose their state and result in text, and host
buttons should provide pending feedback while an asynchronous dispatch is in
flight. Check both color themes and reduced-motion preferences in the host.

A poll keeps the viewer's unsubmitted choice when the shared state changes
under it (the persistent host attaching, another viewer voting). It follows
only the viewer's own stored vote. The host must name that viewer: set
`viewerId` to the same id the services record votes and answers under (the
player passes the active persona).

### Blocks on a slide

A deck renders blocks with `canvasMode: 'slide'`, and every deck slide sets
it, whatever the surrounding host says. A slide is a fixed-size canvas scaled
to the screen, so viewport breakpoints (`sm:`, `lg:`) would follow the phone,
not the slide. On a slide, cards, columns and steps use fixed column counts.
Pages and docs (`flow`) stay responsive.

### Contract checks

Run the package tests and documentation link check after changing authoring
content or renderer behavior:

```sh
pnpm vitest run packages/blocks
pnpm vitest run packages/blocks-ui
pnpm check:docs
```

`packages/blocks/tests/catalog.test.ts` checks catalog completeness and
examples. `packages/blocks/tests/catalog-docs.test.ts` checks that the marked
reference remains byte-for-byte equal to `renderBlockCatalogMarkdown()`.

