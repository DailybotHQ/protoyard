# @protoyard/views-ui

Svelte 5 components for Protoyard's rich views kit (ADR-022): board, calendar,
timeline, data grid, tree, simulated map, editor, activity, notifications,
files, settings, states and an app command palette. They are built on
`@protoyard/ui` tokens, and the engines live in
[`@protoyard/views`](../views/README.md).

> **Status:** `./settings` and `./states` are implemented; the other subpaths
> exist and are empty until their PLAN_003 task lands, and this README
> documents each view then.

## Install

```json
{
  "dependencies": {
    "@protoyard/views-ui": "workspace:*",
    "@protoyard/views": "workspace:*",
    "@protoyard/ui": "workspace:*"
  }
}
```

Import the kit styles after Tailwind, themes and `@protoyard/ui`, so Tailwind
scans the kit's markup:

```css
@import '@protoyard/renderer-svelte/app.css';
@import '@protoyard/views-ui/styles.css';
@source './';
```

## One subpath per view

There is no root entry. Import a view only from a lazy route screen, so each
view stays its own chunk and adds 0 KB to a prototype's initial JS:

```ts
// src/routes.ts
{ path: '/board', name: 'Board', load: () => import('./screens/Board.svelte') }
// src/screens/Board.svelte imports from '@protoyard/views-ui/board'
```

Subpaths: `./board`, `./calendar`, `./timeline`, `./grid`, `./tree`, `./map`,
`./editor`, `./activity`, `./notifications`, `./files`, `./settings`,
`./states`, `./commands`, `./scenarios` and `./styles.css`. Views are never
re-exported from `@protoyard/ui`.

## Bundle hygiene

`tests/bundle-hygiene.test.ts` fails when:

- a view imports another view's subpath or folder (only `lib/` and `states/`
  are shared);
- any file imports `@protoyard/ui` dynamically, which would put the ui barrel
  in every initial chunk (see docs/PERFORMANCE.md, Shells);
- a runtime value is imported from the `@protoyard/views` root instead of an
  engine subpath;
- the exports drift from one subpath per view.

```bash
pnpm vitest run packages/views-ui
pnpm --filter @protoyard/views-ui typecheck
```

## Settings (`@protoyard/views-ui/settings`)

Settings page patterns. Writes go through the prototype's services with
`runService`; nothing here touches data.

| Component | What it does |
| --- | --- |
| `SettingsLayout` | Title, a section nav (`aria-current` on the open one) and the open section, rendered fresh per section (`{#key}`). Below `md` it is a list → detail flow: picking a section focuses its heading, and the back button returns focus to the list. |
| `SettingsSection` | A titled card for a group of rows, with an optional footer. |
| `SwitchRow`, `SelectRow`, `RadioRow` | Labelled preference rows with descriptions (`aria-describedby`); a disabled switch says why (`disabledReason`). |
| `SaveBar` | Appears while `dirty`. Save runs `onSave` and shows the Button spinner until its promise settles; a failed `runService` result with validation issues fills `errors` (bindable) and lists them. While dirty it **guards navigation**: hash changes are stopped before the router sees them and an in-app "Leave without saving?" dialog asks ("Keep editing" / "Discard and leave"); a reload or tab close asks through the browser (`beforeunload`). |
| `DangerZone` | A destructive action behind a dialog where the person types the exact `confirmText`; a failed result keeps the dialog open. |
| `guardHashNavigation` | The guard on its own, for custom forms. |

### Composing with the SaaS kit

`@protoyard/saas-ui` ships a complete `Settings` screen (profile, security,
members, notifications) and does not need changing. When a prototype wants
its own settings page, build it from these patterns on top of the same
`@protoyard/saas` engine services:

```svelte
<script lang="ts">
  import { getRuntime, runService } from '@protoyard/renderer-svelte';
  import { createSettingsServices, DEFAULT_SAAS_NOTIFICATION_PREFERENCES } from '@protoyard/saas';
  import { SaveBar, SettingsLayout, SettingsSection, SwitchRow } from '@protoyard/views-ui/settings';

  const settings = createSettingsServices(getRuntime());
  let saved = $state({ ...DEFAULT_SAAS_NOTIFICATION_PREFERENCES });
  let draft = $state({ ...DEFAULT_SAAS_NOTIFICATION_PREFERENCES });
  let errors = $state({});
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved));

  $effect(() => {
    void runService(() => settings.notificationPreferences()).then((result) => {
      if (!result.ok) return;
      saved = { ...result.value };
      draft = { ...result.value };
    });
  });

  async function save() {
    const result = await runService(() => settings.updateNotificationPreferences(draft), { success: 'Preferences saved' });
    if (result.ok) saved = { ...draft };
    return result; // validation issues show in the SaveBar
  }
</script>

<SettingsLayout sections={[{ id: 'notifications', label: 'Notifications' }]}>
  {#snippet children(section)}
    <SettingsSection title="Email">
      <SwitchRow label="Product updates" bind:checked={draft.productUpdates} />
      <SwitchRow label="Security alerts" bind:checked={draft.securityAlerts} />
      <SwitchRow label="Workspace activity" bind:checked={draft.workspaceActivity} />
    </SettingsSection>
  {/snippet}
</SettingsLayout>
<SaveBar {dirty} bind:errors onSave={save} onDiscard={() => (draft = { ...saved })} />
```

- **Size** (Svelte 5 client output, esbuild minified, gzip -9, with `svelte`,
  `@protoyard/ui`, the renderer, lucide and Bits UI external because
  prototypes already load them; 2026-10-19): all of `./settings` is 5.2 KB;
  per component SettingsLayout 1.7, SaveBar 1.7, DangerZone 1.3, each row or
  SettingsSection about 0.6, the guard 0.4. A typical screen (layout, a
  section, the save bar, a few rows) is about 4.5 KB. Lazy, 0 KB initial.

## States (`@protoyard/views-ui/states`)

`QueryState` is the one boundary for a `liveQuery` result, so no screen shows
a blank or a fake success. Every view in this kit uses it for its own
data-less states.

```svelte
<script lang="ts">
  import { liveQuery } from '@protoyard/renderer-svelte';
  import { QueryState } from '@protoyard/views-ui/states';

  let attempt = $state(0);
  const deals = liveQuery(() => services.listDeals(), { initial: [], deps: () => [attempt] });
</script>

<QueryState query={deals} label="Loading deals" emptyTitle="No deals yet" onRetry={() => attempt++}>
  {#snippet children(list)}<DealTable rows={list} />{/snippet}
  {#snippet emptyAction()}<Button onclick={() => runService(() => services.createDeal(draft))}>New deal</Button>{/snippet}
</QueryState>
```

| State | When | Shows |
| --- | --- | --- |
| loading | before the first result | nothing for 150 ms (like the renderer's pending bar), then a skeleton (`role="status"` named by `label`), or your `loading` snippet |
| reloading | `loading` again with data on screen | the data, with `aria-busy` |
| empty | `isEmpty(current)` (default: undefined, null or `[]`) | `EmptyState` named by `emptyTitle`, with `emptyAction` |
| offline | `SimulatedServiceError` with code `offline` | an alert that says the simulated network is off, with retry |
| denied | `PermissionDeniedError` | an alert naming the missing capability and saying roles are simulated (switch persona in DevTools); no retry, since retrying cannot help |
| failed | any other error | an alert with the error message and retry |

- Errors are sorted by class (`classifyQueryError`, exported), never by
  message text; a class with the same `name` also counts, because a
  duplicated core copy breaks `instanceof` (the renderer's `runService` does
  the same).
- `onRetry` should re-run the query, e.g. by bumping a value in its `deps`.
- **Size** (Svelte 5 client output, esbuild minified, gzip -9, with svelte,
  core, `@protoyard/ui`, the renderer and lucide external): 1.4 KB, small
  enough for route screens to import statically.

