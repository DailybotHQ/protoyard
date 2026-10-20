# Avatars

Protoyard ships a library of **175 portraits of fictional people**
(`@protoyard/avatars`, in [packages/avatars](../packages/avatars/README.md)).
Generators give every seeded person a face, and screens show it through the
`@protoyard/ui` `Avatar`, with initials as the fallback. This page covers
where the faces come from, how they are assigned, how they render, what they
cost and how to re-import them.

## Provenance and license

- The repository owner created the portraits with an image generator as
  **fake people for prototypes**. He cut them from seven generated grids with
  his own `slicra` tool. **They are not photos of real people.**
- The repository holds only optimized WebP derivatives at 64 and 128 px. The
  original PNGs stay on the owner's machine.
- They are published under the repository's license (MIT), like the code.
- Use them only as placeholder people in prototypes. Never present them as
  real customers, employees or users.

**Never add photos of real people** to the library, to a prototype, a
scenario, a snapshot or a blueprint. That includes yourself, colleagues,
customers, public figures and stock photos of identifiable people. Real faces
are personal data, and the rule against real PII ([SECURITY](SECURITY.md))
covers them too. Every new face must be a generated, fictional person whose
creator can publish it under MIT.

## Ids and what `persona.avatar` accepts

Library ids are `av-` plus a three-digit number, from `av-001` to `av-175`.
They follow the source file numbers (`avatar7.png` → `av-007`).
`isAvatarId` (exported by `@protoyard/avatars`, `@protoyard/scenarios` and the
renderer) accepts only that range.

`persona.avatar` is optional. `PersonaAvatarSchema` in
`packages/core/src/session.ts` accepts at most 2048 characters in one of three
forms:

| Form | Example | Notes |
| --- | --- | --- |
| Library id | `av-042` | Core checks only the `av-NNN` shape, so it does not depend on the library. The renderer checks the range and shows initials for an unknown id. |
| `https://` URL | `https://images.example.com/ada.webp` | Host, optional port, then a path, query or fragment. No credentials, whitespace or backslashes. |
| Root-relative path | `/avatars/64/av-002.webp` | One leading `/`, never `//host` or `/\host` (both resolve off-origin). |

`isPersonaAvatar(value)` applies the same test without zod. Anything else is
rejected: `javascript:`, `data:`, `http:`, `blob:`, `//host`, relative paths,
whitespace. Blueprint `avatar` fields are stricter. They store library ids
only, and validation fails with "must be a library face from av-001 to
av-175".

## Deterministic assignment

"Random" faces stay reproducible. The pickers in `packages/avatars/src/pick.ts`
draw only from the rng they are given, never from `Math.random()` or the
clock:

- `createAvatarPool(rng, { avoid? })` is a shuffled deck of all 175 ids.
  `next()` deals each id once before the deck reshuffles, and the same face
  never comes twice in a row across rounds. Ids passed in `avoid` are dealt
  last in the first round, so people a later generator adds get fresh faces.
- `assignAvatars(rng, count, options?)` returns `count` ids from a new pool, so
  there are no repeats among the first 175.
- `pickAvatar(rng)` returns one id. Repeats are possible across calls.

Generators pass a **fork with a stable key**, so the face draws never shift any
other seeded value, and adding a generator never shifts these faces:

| Generator | Fork key | Notes |
| --- | --- | --- |
| `generateTeam` (`@protoyard/scenarios`) | `protoyard:avatars:team` | Every persona gets a face. Team faces come first and are distinct until the library runs out. |
| `generateSaasWorld` (`@protoyard/saas`) | `protoyard:avatars:saas` | Invitees, and members without a face, avoid the team's faces. |
| `defaultPeople` (`@protoyard/views/scenarios`) | the views `avatars` stream | Its own stream, so faces never shift names. |
| Blueprint worlds (`@protoyard/blueprint`) | `blueprint:avatars:<entity>.<field>` | One pool per entity and avatar field, which avoids the team's faces. |
| Your generator | for example `crm-demo:avatars:contacts` | `createAvatarPool(ctx.rng.fork('<slug>:avatars:<people>'), { avoid: team.personas.map((p) => p.avatar) })` |

`@protoyard/scenarios` re-exports the pickers, so a generator needs no new
dependency. Assigning faces changes the world for the same seed, so the
generator version moved with it. `GENERATOR_SDK_VERSION` went from 2 to 3,
`BLUEPRINT_GENERATOR_SDK` to 4 and then 5 (with the avatar field kind),
`SAAS_GENERATOR_VERSION` and `VIEWS_GENERATOR_VERSION` to 2, and
`CRM_GENERATOR_VERSION` to 4. Bump your `generatorVersion` when you add or
change face assignment ([SCENARIOS](SCENARIOS.md#generator-versions)).

### The blueprint `avatar` field

A blueprint entity can declare a face field:

```json
{ "name": "avatar", "kind": "avatar", "label": "Photo" }
```

It stores a library id and is never indexed, searched or sorted. Generated rows
get seeded faces as above. In the app, the crud form shows an `AvatarPicker`
("Choose face" opens a searchable grid of lazy thumbnails). "Shuffle face"
calls `EntityService.shuffleAvatar(id, field?)`, a normal service mutation
(`<entity>:update` or `update:own`, operation `<entity>.shuffleAvatar`, then
`environment.run` and `db.transaction`, with an audit entry).

The shuffle is deterministic as well. `nextAvatar(current, key)` in
`packages/blueprint/src/avatar.ts` uses the key `<entity>:<id>:<field>` to
pick a step that is coprime with 175. Repeated shuffles visit every face once
before any repeats and never return the current face. A missing or unknown
current value starts at a face derived from the key. No clock and no random
source are involved.

## How photos render

Screens never build image URLs by hand. They spread `avatarImage()` from
`@protoyard/renderer-svelte` on the ui `Avatar`:

```svelte
<Avatar name={persona.name} {...avatarImage(persona.avatar)} />
```

1. `avatarImage(value)` re-checks the value with `isPersonaAvatar`, because
   snapshot imports do not re-validate personas. It then resolves it:
   - A library id becomes `src` = `<base>64/<id>.webp` and
     `srcset` = `… 64 px 1x, … 128 px 2x`. With a single shipped size (the
     artifact pack) there is only a `src` with the 128 px file.
   - An `https://` URL or root-relative path passes through as `src` alone.
   - A missing, unsafe or unknown value, or a build with avatars turned off,
     gives `{}`.
2. `Avatar` (`packages/ui/src/components/avatar/Avatar.svelte`) checks `src`
   and every `srcset` candidate again with `isSafeImageSource` /
   `safeSrcset`. It accepts `https:`, root-relative and relative paths (the
   relocatable `./avatars/…`). It refuses every other scheme, `//host`,
   whitespace, quotes, backslashes and control characters. An unsafe `srcset`
   is dropped, and the plain `src` still shows.
3. The `<img>` has `loading="lazy"`, `decoding="async"` and a fixed width and
   height (20, 28, 36 or 48 CSS px for `xs` to `lg`), so it never shifts
   layout. It uses the name as `alt`, or an empty `alt` when `decorative`.
4. **Initials are the fallback.** They show when there is no source, when the
   source is unsafe, or when the image fails to load. A new `src` is tried
   again.

`<base>` comes from the build. A standalone build serves `<base>avatars/`
(`./avatars/` for the relocatable default). A showcase serves one shared
`<base>avatars/` folder. `PROTOYARD_AVATAR_BASE` points a build at a shared
folder and emits no copy. Turn the images off with
`defineProtoyardConfig({ avatars: false })` or `PROTOYARD_AVATARS=0`. Then ids
resolve to nothing and initials show. The dev server serves the same
`avatars/<size>/<id>.webp` paths from the library folder.

## Sizes and budgets

Measured 2026-10-19 on the machine named in [PERFORMANCE](PERFORMANCE.md)
(Apple M1 Max, Node 26.11.1, pnpm 11.23.0). Method: `stat` byte sizes of
`packages/avatars/assets/**`, `pnpm exec tsx scripts/import-avatars.ts --check`,
`pnpm protoyard build crm-demo` and then `find` + `stat` over
`artifacts/crm-demo/dist`, and
`pnpm protoyard export crm-demo --target artifact --dry-run --json`. The
encoder versions are those recorded in the manifest (sharp 0.35.5,
libvips 8.18.7, libwebp 1.6.0).

| Asset | Files | Total | Average | Smallest | Largest |
| --- | ---: | ---: | ---: | ---: | ---: |
| 64 px WebP (q70) | 175 | 156,810 B (153.1 KB) | 896 B | 692 B | 1,100 B |
| 128 px WebP (q65) | 175 | 356,386 B (348.0 KB) | 2,037 B | 1,436 B | 2,818 B |
| **Library** | 350 | **513,196 B (501.2 KB)** | | | |
| `src/manifest.json` | 1 | 120,030 B (26,035 B gzip -9) | | | |

(KB here means 1,024 bytes.) `du -sk` reports 1,400 KB on disk for `assets/`
because of file-system block rounding, not because of file content.

What a prototype ships:

- **Every standalone build copies the whole library**, not only the faces it
  references. The renderer's Vite plugin emits all 350 files as
  `avatars/64/` and `avatars/128/`, with fixed names and no content hash. It
  finds them by Node package resolution of `@protoyard/avatars` (a renderer
  dependency), so builds work in this repository, from packed packages and
  from a consumer's `node_modules`. When the package cannot be resolved, the
  build fails and says to install it or set `avatars: false`. In
  the `crm-demo` build these are 350 of the 413 files in `dist` and
  513,196 of 2,151,178 bytes (about 24%). They are byte-identical to the
  library. WebP does not compress further: gzip -9 over the 350 files gives
  525,446 B.
- **A visitor downloads only the faces on screen.** The images are static
  files that no JavaScript imports, and every `<img>` is lazy. A face costs
  about 0.9 KB at 1x and about 2 KB at 2x. The manifest is never bundled: no
  JavaScript chunk of the `crm-demo` build contains its hashes.
- **The artifact pack ships 128 px only**: 175 files, 356,386 B (the
  `avatars` summary of the dry run), against the 511-file version cap
  (`packages/cli/src/lib/artifact-pack.ts` records that `ui-kit` packs 356
  files this way, where both sizes would be 531). 64 px requests resolve to
  the 128 px file, and the browser downscales.
- **A showcase copies the library once** at its root and builds every app
  against that folder (`packages/cli/src/commands/showcase.ts`).

The budgets are enforced by `packages/avatars/tests/manifest.test.ts`: at
most 4 KB per 64 px file, 12 KB per 128 px file, a 6 KB average at 128 px, and
1.2 MB for all assets. The measured library is well inside all four.

## Re-import or add avatars

`scripts/import-avatars.ts` turns `avatar<N>.png` files into the library. It
insets 6 px (this drops the slicing border and the rounded corners),
center-crops to a square, flattens onto white, resizes with lanczos3 and
encodes lossy WebP (effort 6, `smartSubsample`, no alpha or metadata). It
writes `packages/avatars/assets/<size>/av-NNN.webp` and
`packages/avatars/src/manifest.json`, and never writes outside
`packages/avatars`. The output is deterministic: the same source bytes and the
same sharp, libvips and libwebp build give byte-identical files.

```bash
pnpm exec tsx scripts/import-avatars.ts --help             # usage
pnpm exec tsx scripts/import-avatars.ts --dry-run          # report sizes, write nothing
pnpm exec tsx scripts/import-avatars.ts --check            # verify committed files match the source (exit 1 on drift)
pnpm exec tsx scripts/import-avatars.ts [--src <dir>]      # rewrite assets/ and src/manifest.json
pnpm vitest run packages/avatars
```

`--src <dir>` (or `PROTOYARD_AVATARS_SRC`) is required: it names the owner's
local folder of original PNGs (`_manifests/` and `_previews/` in it are ignored). `--check` and
`--dry-run` need the original PNGs, so contributors without them can only run
the tests. A different sharp or libwebp build can change the bytes. `--check`
then reports the version difference.

To **add** faces (generated, fictional people only, see above):

1. Add `avatar176.png`, `avatar177.png`, … to the source folder. The numbers
   must be contiguous from 1, and ids stop at 999.
2. Run the import, then `--check`.
3. Raise `AVATAR_COUNT` in `packages/avatars/src/index.ts` and in
   `packages/renderer-svelte/src/avatars.ts` (a renderer test keeps them in
   sync), and update the tests and messages that name 175 (for example the
   blueprint validation message).
4. A larger library changes every shuffled deck and the `nextAvatar` walk, so
   seeded faces change. Bump `GENERATOR_SDK_VERSION`, `BLUEPRINT_GENERATOR_SDK`
   and every generator version that deals faces, then refresh what depends on
   seeded output (specs, thumbnails, e2e expectations).
5. Re-measure this page and the artifact-pack file count against the 511-file
   cap.

### Tests that guard the library

| Test | What it checks |
| --- | --- |
| `packages/avatars/tests/manifest.test.ts` | 175 unique ids in source order. Every file exists with its recorded bytes and sha256. WebP header dimensions. No stray files. The size budgets. `avatarFile`, `isAvatarId`, `isAvatarSize`. |
| `packages/avatars/tests/pick.test.ts` | Seeded assignment: determinism, no repeats within 175, valid ids, `avoid`. |
| `packages/core/tests/persona-avatar.test.ts` | `PersonaAvatarSchema` and `isPersonaAvatar`: accepted and refused forms. |
| `packages/renderer-svelte/tests/avatars.test.ts`, `avatar-image.test.ts`, `avatars-build.test.ts` | URL and `srcset` resolution, `avatarImage`, the id rules in sync with the library, images emitted into builds. |
| `packages/renderer-svelte/tests/avatars-resolution.test.ts` | The library is found by package resolution in the monorepo, in pnpm (symlinked) and npm (flat) consumer `node_modules` with dist-only exports, and an uninstalled package fails with the fix. |
| `packages/ui/tests/avatar.test.ts` | Lazy fixed-size `<img>` with `srcset`, unsafe sources falling back to initials, retry after an error. |
| `packages/blueprint/tests/avatar.test.ts` | The avatar field, seeded faces and `shuffleAvatar` / `nextAvatar`. |

`pnpm vitest run packages/avatars` selects 2 files and 13 tests. Together with
the other files in the table it is 8 files and 95 tests (2026-10-19).
