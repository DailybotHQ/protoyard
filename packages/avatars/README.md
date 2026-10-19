# @protoyard/avatars

A data-only library of **175 portraits of fictional people** for Protoyard
prototypes: square, center-cropped WebP at 64 and 128 px, plus a verified
manifest. No Svelte, no runtime dependencies, no side effects.

## Provenance

The repository owner generated these portraits as fake people for prototypes.
**They are not real people.** They are published under this repository's
license (MIT). Use them only as placeholder people in prototypes, and never
present them as real customers, employees or users.

The original PNGs (about 228×223 px, cut from seven generated grids) are not
in the repository. Only the optimized derivatives below are.

## What ships

| Size | Files | Total | Average | Largest | WebP quality |
| --- | --- | --- | --- | --- | --- |
| 64 px | 175 | 153.1 KB | 0.88 KB | 1.07 KB | 70 |
| 128 px | 175 | 348.0 KB | 1.99 KB | 2.75 KB | 65 |
| **All** | 350 | **501.2 KB** (513,196 bytes) | | | |

These are measured by `tsx scripts/import-avatars.ts --check`. The manifest
(`src/manifest.json`) adds about 120 KB of JSON for tooling, and the package
entry never imports it.

- **Ids:** `av-001` … `av-175`, numbered like the source files (`avatar7.png` → `av-007`).
- **Why two sizes:** UI avatars render at 48 CSS px at most, so 64 px covers
  1x screens and 128 px covers 2x screens.
- **Why WebP only:** at equal PSNR on a 14-image sample, AVIF was about 22%
  smaller at 128 px (1.71 KB vs 2.19 KB at 33.9 dB) and about the same at 64 px.
  Adding AVIF next to a WebP fallback would grow the repository by about
  300 KB to save about 80 KB per full download, so the library stays WebP-only.
  WebP is supported by every current browser.
- **Encoding:** 6 px edge inset (this drops the slicing border and the rounded,
  transparent corners), centered square crop, flattened onto white, lanczos3
  resize, lossy WebP (effort 6, `smartSubsample`), no alpha and no metadata.
  Quality was picked visually: at 64 px, q55–60 showed chroma blotches on skin,
  and q70 is clean.

## Use

```ts
import { AVATAR_IDS, AVATAR_COUNT, AVATAR_SIZES, avatarFile, isAvatarId } from '@protoyard/avatars';

avatarFile('av-007', 128); // 'assets/128/av-007.webp' (package-relative)
isAvatarId('av-176'); // false
```

### Seeded assignment

"Random" faces stay reproducible: the pickers draw only from the rng they are
given (any `Rng` from `@protoyard/core`, such as `ctx.rng` or `createRng(seed)`),
never from `Math.random()` or the clock. The same seed always gives the same faces.

```ts
import { assignAvatars, createAvatarPool, pickAvatar } from '@protoyard/avatars';

// Fork with a stable key so adding another generator never shifts these faces.
const avatars = createAvatarPool(ctx.rng.fork('my-app:avatars:customers'));
const customer = { name: 'Ada Example', avatar: avatars.next() };

assignAvatars(ctx.rng.fork('my-app:avatars:team'), 12); // 12 distinct ids
pickAvatar(ctx.rng); // one id; repeats are possible across calls
```

A pool deals every id once (175) in a shuffled order before it reshuffles, and
never repeats a face back to back across rounds. Pass `{ avoid: ids }` to deal
ids already in use last in the first round, so people added by a later
generator get fresh faces. The built-in generators already do this:
`generateTeam` (`@protoyard/scenarios`, so blueprint worlds too),
`generateSaasWorld` invitees (`@protoyard/saas`) and `defaultPeople`
(`@protoyard/views/scenarios`).

The images resolve as `@protoyard/avatars/assets/<size>/<id>.webp`. Full
metadata (bytes, sha256, width and height per size, the source file name and
its sha256, and the encoder versions) is in `@protoyard/avatars/manifest.json`.

## Re-import

The import is deterministic. The same source bytes and the same
sharp/libvips/libwebp build give byte-identical files and manifest.

```bash
pnpm exec tsx scripts/import-avatars.ts --dry-run                 # report sizes, write nothing
pnpm exec tsx scripts/import-avatars.ts [--src <dir>]             # rewrite assets/ + src/manifest.json
pnpm exec tsx scripts/import-avatars.ts --check                   # verify committed files match the source
pnpm vitest run packages/avatars
```

`--src` defaults to `~/projects/ptt/avatars-grids-recortes` (the owner's
local folder of `avatar<N>.png`; `_manifests/` and `_previews/` are ignored).
The script only writes inside `packages/avatars`. `--check` needs the
original PNGs, and a different sharp or libwebp build can change the bytes.
The manifest records the encoder versions it was made with.

## Tests

`tests/manifest.test.ts` checks that there are 175 unique ids in source order,
that every file exists with its recorded bytes and sha256, and that dimensions
parsed from the WebP header are right. It also checks that there are no stray
files, enforces the budgets (64 px ≤ 4 KB, 128 px ≤ 12 KB per file, 128 px
average ≤ 6 KB, all assets ≤ 1.2 MB), and covers `avatarFile`, `isAvatarId` and
`isAvatarSize`. `tests/pick.test.ts` covers seeded assignment (determinism, no repeats
within 175, valid ids).
