# Protoyard UI Kit: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

Routes are declared with `createRouter` in `src/App.svelte` (hash
routing; titles get the suffix "Protoyard UI Kit"):

| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Overview | — | Kit stats, groups and recently starred entries |
| `#/components/:group` | Components | — | Every entry of one group with live demos (`patterns` included) |
| `#/c/:id` | Component | — | One catalog entry with previous / next navigation |
| `#/themes` | Theme lab | — | Theme library, Theme Studio and the token table |
| `#/forms` | Forms | — | A validated "Create workspace" form |
| `#/a11y` | Accessibility | — | Live contrast audit, guarantees and keyboard map |
| `#/favorites` | Favorites | — | The acting persona's starred entries |

Group ids: `forms`, `overlays`, `navigation`, `feedback`, `display`,
`data`, `layout`, `chat`, `flows`, `mobile`, `patterns`.

States that apply to every screen:

- **No route guards.** Every persona can open every screen. Only the
  favorite controls change by role (see [PERMISSIONS.md](PERMISSIONS.md)).
- **Loading.** Every screen except Overview is a lazy chunk: the router
  shows "Loading screen" while it loads and "This screen could not be
  loaded" with a retry if the chunk fails. An unknown path shows "Page not
  found".
- **Errors.** Favorites come from a local `liveQuery`, which has no error
  state. Favorite write failures appear as toasts ([FLOWS.md](FLOWS.md)).

### Overview (`#/`)

- **Purpose:** introduce `@protoyard/ui` and route people into the kit.
- **Data:** a hero ("The components behind every Protoyard prototype")
  with a DevTools shortcut hint; four stat cards: Components (50, "10
  groups"), Patterns (4), Themes (the number of built-in presets, "Light +
  dark each") and "Your favorites" (count, with the persona's name); the 11
  groups with entry counts and descriptions; "Recently starred" (the five
  newest favorites).
- **Actions:** "Browse components" (to Forms group), "Open the theme
  lab", group links, links to recently starred entries and "All favorites
  →".
- **Empty:** "Nothing starred yet. Use ☆ on any component."

### Components (`#/components/:group`)

- **Purpose:** a gallery of one group.
- **Data:** group name and description; chips linking to each entry; one
  showcase card per entry: name (linked to its page), group badge, summary,
  the live demo, a "Usage" code block and the entry's accessibility notes.
- **Actions:** star or unstar each entry
  ([Star a component](FLOWS.md#star-a-component)); interact with each demo
  ([Try a component demo](FLOWS.md#try-a-component-demo)); copy the snippet
  ([Copy a usage snippet](FLOWS.md#copy-a-usage-snippet)).
- **Loading:** each demo shows a pulsing placeholder ("Loading <name>
  demo") while its chunk loads. **Error:** "Could not load the demo: …".
  "No demo registered for “<id>”." if the registry lacks it.
- **Not found:** an unknown group shows "Unknown group" ("There is no
  “<group>” group in the kit.").
- **Denied:** for a viewer the star is a locked button with a tooltip.

### Component (`#/c/:id`)

- **Purpose:** one entry on its own page, for linking and focused review.
- **Data:** a breadcrumb (Overview › group › name) and the same showcase
  card as the group page, with the name as the page heading.
- **Actions:** star or unstar; previous and next entry buttons in catalog
  order (across groups); the demo and snippet actions.
- **Not found:** "Component not found" ("“<id>” is not in the catalog.")
  with "Back to overview".
- **Loading / error / denied:** as on the group page.

### Theme lab (`#/themes`)

- **Purpose:** compare themes, tune a draft and read live tokens with
  contrast ratios.
- **Data:** "Theme library" with a count ("N loaded · M library presets")
  and a Category select (All themes, Built-in presets, each product
  category of the library, Custom themes); one card per theme with name,
  description, category, an "Active" badge for the prototype's current
  theme and scoped light and dark previews (buttons, badges, a card, an
  input, a progress bar and a switch rendered in that theme only). The
  "Theme Studio" panel with name, brand color, font pairing, density and
  corner radius inputs and live light/dark previews. "Tokens — <theme>": a
  table of every palette token with its CSS variable, value and contrast
  badges (text pairs need 4.5:1, UI pairs 3:1; ✓ or ✗; "translucent" for
  values without a hex color).
- **Actions:** change category (library tokens load only for the visible
  categories); "Inspect tokens"; "Use in prototype"
  ([Use a theme](FLOWS.md#use-a-theme-in-the-prototype)); "Save draft as
  custom theme" ([Save a Theme Studio draft](FLOWS.md#save-a-theme-studio-draft));
  pick the theme to inspect and Light / Dark; "Copy theme tokens"
  ([Inspect and copy theme tokens](FLOWS.md#inspect-and-copy-theme-tokens)).
- **Loading:** "Loading theme tokens…" while a category's library themes
  load and none are shown yet.
- **Empty:** "No themes in this category yet." (for example "Custom
  themes" before saving one).
- **Error:** "Some library themes could not be loaded. Try another
  category."; the clipboard fallback textarea.
- **Denied:** none; every persona can use the lab.

### Forms (`#/forms`)

- **Purpose:** show the form components working together with real
  validation.
- **Data:** the "Create workspace" card (FormField, Input, Textarea,
  Select, Combobox, RadioGroup, Switch, Checkbox) and, after a successful
  submit, a "Submitted values" card with a "Saved" badge.
- **Actions:** fill and submit, "Reset"
  ([Submit the Forms page](FLOWS.md#submit-the-forms-page)).
- **Loading:** fields are disabled and the button reads "Creating…" for
  800 ms. **Error:** inline field errors and a "Please fix N fields"
  alert. **Denied:** none.

### Accessibility (`#/a11y`)

- **Purpose:** what the kit guarantees and how to keep it when composing
  screens.
- **Data:** "Live contrast audit" of the **active** theme and mode (built-in,
  library or custom, resolved via `getTheme` plus the runtime/custom/library
  lists); a **Catalog contrast sweep** over every loaded theme in both modes;
  eight guarantees; a keyboard map; a checklist for composing screens.
- **Actions:** none (read-only); the live audit follows theme and mode
  changes from DevTools or the Theme lab.

### Favorites (`#/favorites`)

- **Purpose:** the acting persona's starred entries, newest first.
- **Data:** each row has the entry name (linked), summary, "starred
  <today | yesterday | N days ago>" (hidden on small screens) and a filled
  star.
- **Actions:** unstar a row
  ([Unstar a component](FLOWS.md#unstar-a-component)); "Clear all" with
  confirmation ([Clear all favorites](FLOWS.md#clear-all-favorites)).
- **Loading:** three skeleton rows.
- **Empty:** "No favorites yet" with "Star components with the ☆ button to
  collect the ones you use most." (or, for a viewer, "Viewers can browse
  but not star. Switch to the designer persona in DevTools.") and "Browse
  components".
- **Denied:** "Clear all" is hidden without `favorites:manage`; row stars
  are locked.

## Shell

`protoyard.json` sets `"preview": { "viewport": "desktop" }` and
`"platform": "responsive"`: the kit is designed for and previewed at a
desktop viewport, and the layout also works on smaller screens. It uses the
`AppShell` from `@protoyard/ui`: a collapsible sidebar ("UI Kit") with the
kit logo, the main links (Overview, Theme lab, Forms, Favorites with a
count badge, Accessibility), one link per component group with its entry
count and "All patterns"; and a header with the page title, a "Read-only"
badge for viewers and the persona's name and avatar. On phones and tablets
the sidebar opens as a drawer. Content is centered with a maximum width of
`max-w-6xl`. The default theme is `violet` and the mode follows the system
setting (`dark-viewer` forces dark). The static build shows the demo badge
and does not include DevTools.
