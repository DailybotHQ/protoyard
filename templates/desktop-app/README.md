# Desktop App

A desktop-app Protoyard starter: a notes workspace with **folders, tags and documents**, a
working **menu bar**, a **three-pane** document view (folders · list · editor), a status bar
and **keyboard shortcuts**, framed in a desktop window (`preview.shell: "desktop-window"`).
It has three personas (owner, editor, read-only viewer) and three scenarios. Built to be
extended.

```bash
pnpm protoyard new my-notes --template desktop-app   # create a prototype from this template
pnpm protoyard dev my-notes                           # run it
pnpm vitest run prototypes/my-notes                   # tests
pnpm --filter @prototype/my-notes typecheck
```

## What's inside

```text
src/
├── App.svelte                 hash router; renders ONE Workspace from the current match
├── prototype.ts               definePrototype: manifest + schema + policy + scenarios + generator
├── database/schema.ts         folders, tags, documents (`*tagIds` multi-entry index)
├── domain/services.ts         services: assert permission → validate → environment.run → write
├── domain/policy.ts           roles → capabilities (owner: all, editor: no folder delete, viewer: read)
├── domain/validation.ts       zod input schemas (field errors render inline)
├── scenarios/index.ts         empty · active · large
├── scenarios/generators.ts    deterministic world (seeded rng/faker, fixed reference time)
├── lib/shortcuts.ts           the shortcut table (key handler, menu hints and help dialog share it)
├── lib/context.ts             provideDesktop()/useDesktop(): runtime, db and services
├── components/                MenuBar, FolderNav, DocumentList, DocumentEditor, dialogs
└── screens/Workspace.svelte   menu bar, panes, status bar, shortcuts, unsaved-changes guard
```

- **Real behavior:** every menu item is an action. File → New document, New folder, Save,
  Close and Delete; Edit → Find and Pin; View → Show or hide the sidebar; Help → Keyboard
  shortcuts. Items your role cannot use are disabled, and the services also call
  `session.assert(...)`, so bypassing the UI still fails.
- **Editing:** edits stay local until you save (the button, File → Save, or the shortcut).
  Closing or switching documents with unsaved edits asks first. A folder can only be
  deleted when it is empty, so no document is lost with it.
- **URLs:** the route picks the scope (`#/`, `#/folders/<id>`, `#/tags/<id>`) and `?doc=<id>`
  the open document, so a reload or a shared link restores the exact view. The window title
  names the open document.
- **Persistence:** lists read with `liveQuery(...)`, so every change (yours, a scenario load,
  a snapshot restore) re-renders on its own, and reloading keeps your edits.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| New document | ⌥N | Alt+N |
| New folder | ⌥⇧N | Alt+Shift+N |
| Save document | ⌘S | Ctrl+S |
| Search documents | ⌘K | Ctrl+K |
| Close document | ⌥W | Alt+W |
| Show or hide the sidebar | ⌘\ | Ctrl+\ |
| Keyboard shortcuts | ? | ? |

Browsers keep ⌘/Ctrl+N, +W and +T for themselves and never pass them to a page, so the
prototype uses ⌥/Alt for new and close. Letters match by `KeyboardEvent.code`, so ⌥N works
even though it types "˜" on a Mac. Add a shortcut in `lib/shortcuts.ts` and handle its id in
`Workspace.svelte` → `run()`; the menu hint and the help dialog pick it up automatically.

## Desktop window

`protoyard.json` sets `"preview": { "shell": "desktop-window", "device": "laptop-window" }`.
On a desktop browser the renderer draws the app in a generic window (mac-like or
windows-like title bar, by the visitor's OS or `preview.chrome.os`) with a working dock or
taskbar. On a phone or inside the gallery preview it renders full-bleed. Layout uses
`h-app`, so the workspace fills the window below its title bar.

## Extend it

**Add a table:** in `src/database/schema.ts`, add a type and a **new** version (never edit a
version that has shipped), bump `storage.schemaVersion` in `protoyard.json`, add the typed
table to `DesktopDatabase`, generate rows in `scenarios/generators.ts`, and declare its foreign
keys in `prototype.ts` → `integrity.relations`.

**Add a service:** copy the shape of a service in `domain/services.ts` and keep the four steps
(`session.assert` → validate → `environment.run` → one Dexie transaction).

**Add a scenario:** append it to `scenarios/index.ts` **and** list its id in `protoyard.json`
→ `scenarios`. Bump `DESKTOP_GENERATOR_VERSION` when the same seed starts producing
different data.
