# @protoyard/core

Framework-agnostic contracts for Protoyard: zod schemas, TypeScript
interfaces, and the small deterministic primitives every other package builds
on. Its only runtime dependency is `zod`; Faker is imported for types only.
Nothing here imports Svelte, Dexie or Node APIs.

## Modules

| File | What it defines |
| --- | --- |
| `manifest.ts` | `PrototypeManifestSchema` for `protoyard.json` (id, slug, kind, platform, `preview` (viewport, `shell`, `device`, `orientation`, `chrome` with fictional-only origins, optional `layout`), storage namespace + schemaVersion, build flags, scenario ids), `ShellSchema`, `resolveShell` (`auto` → `phone` for mobile, else `none`), the optional marketplace `catalog` block (`CatalogSchema`, `CATALOG_CATEGORIES`), `parseManifest`, `MANIFEST_FILENAME` |
| `slug.ts` | `checkSlug` / `isValidSlug` / `slugify`, reserved slugs. This is the path-safety gate for the CLI. |
| `prototype.ts` | `definePrototype` and `PrototypeDefinition` (manifest, `DatabaseDefinition` versions/migrations, scenarios, `generate`, `generatorVersion`, `policy`, `integrity`, `themes`, `timeline`, `applyEvent`), `WorldSeed`, `GenerateContext`, `RESERVED_TABLES` |
| `scenario.ts` | `ScenarioSchema` and its independent axes (organization, actor, density, activity, environment, appearance, generator knobs), `defineScenario`, `parseScenarioLink` / `buildScenarioLink` for safe reproducible links (including `?shell=` and `?layout=`) |
| `manifest.ts` | `PrototypeManifestSchema` for `protoyard.json` (id, slug, kind, platform, `preview` (viewport, `shell`, `device`, `orientation`, `chrome` with fictional-only origins), storage namespace + schemaVersion, build flags including the optional `build.review` (`ReviewBuildSchema`, `resolveReviewBuild`: adapter `local`/`cloudflare`/`http`/`artifact`, safe endpoint, Cloudflare store `kv`/`d1`; ADR-025), scenario ids), `ShellSchema`, `resolveShell` (`auto` → `phone` for mobile, else `none`), the optional marketplace `catalog` block (`CatalogSchema`, `CATALOG_CATEGORIES`), `parseManifest`, `MANIFEST_FILENAME` |
| `scenario.ts` | `ScenarioSchema` and its independent axes (organization, actor, density, activity, environment, appearance, generator knobs), `defineScenario`, `parseScenarioLink` / `buildScenarioLink` for safe reproducible links (including `?shell=`, and `review` from `?comments=0/1` and `?review=<key>`, `REVIEW_KEY_PATTERN`) |
| `session.ts` | `Organization`, `Persona`, `Membership`, capability-based `createPermissionPolicy` (wildcards, `-denials`, record rules), `PermissionDeniedError`, `resolvePrincipal` |
| `clock.ts` | `createSimulationClock` (preview vs committed time), `createTimeHelpers`, `Duration` |
| `environment.ts` | `createSimulationEnvironment` (network, latency, reproducible failure modes with optional `failureScope`, subscription, flags), `EnvironmentPatchSchema` (partial **without** defaults), `SimulatedServiceError` |
| `random.ts` | Seeded `createRng` (mulberry32) with `fork`, deterministic `createIdFactory`, `createRuntimeId` for user-created rows |
| `events.ts` | `DomainEvent` envelope and deterministic `eventId()` |
| `overrides.ts` | `OverridesSchema`, `resolveEffective` and the value sources (override › preference › scenario › default) |
| `snapshot.ts` | `SnapshotSchema`, `validateSnapshot` and `parseSnapshotText` (size limit, wrong-prototype rejection, schema-version checks). These never throw on untrusted input. |
| `devices.ts` | Brand-neutral device catalog (`DEVICES`, `DeviceSpecSchema`: CSS size, corner radius, portrait/landscape safe areas, status bar, home indicator, cutout), `getDevice`, `rotate`, `orient`, `safeAreaOf`, `fitScale`. Data only, no DOM. |
| `layouts.ts` | App layout contract (ADR-023): `LAYOUT_IDS` / `LayoutIdSchema` (`custom` is the default: the prototype renders its own), `LayoutSettingsSchema` for `preview.layout` (`{ id, supported?, options? }`), the `LAYOUTS` catalog (label, platforms, `minWidth`, `fallback`), `getLayout`, `layoutChoices`, `layoutForWidth`. Data only, no DOM. |
| `theme.ts` | `ThemeSchema`, the token palette, the optional `style` profile (`ThemeStyleSchema`, `DEFAULT_THEME_STYLE`, `resolveThemeStyle`: typography, shape, elevation, surface, motion, focus ring), `defineTheme`, `tokenToCssVar` (`--py-*`) |
| `validation.ts` | `ValidationError` (`issues`: field path → first message, `form` for root issues) and `parseInput(schema, input)` for service inputs; `runService` in `@protoyard/renderer-svelte` leaves these errors to the form |
| `review.ts` | Subpath `@protoyard/core/review` only (not in the barrel, so builds without review pay nothing): `ReviewCommentSchema` (`formatVersion` 1, plain-text body 1–2,000 characters, self-declared author 1–60 characters, wall-clock ISO timestamps), `ReviewAnchorSchema`, `ReviewContextSchema`, `ReviewThreadSchema`, `groupReviewThreads`, `safeParseReviewComment`, `REVIEW_LIMITS`. Comments are untrusted text: control and bidi-override characters are rejected, and nothing here renders markup. |
| `runtime.ts` | `PrototypeRuntime` and its controllers (scenarios, session, overrides, theme, snapshots, data inspector), implemented by `@protoyard/runtime` |

## Example

```ts
import { createPermissionPolicy, createRng, createSimulationClock } from '@protoyard/core';

const rng = createRng(42);
rng.int(1, 6); // same value on every machine for seed 42

const clock = createSimulationClock({ referenceTime: '2026-10-16T10:00:00Z' });
clock.preview({ days: 7 }); // UI-only; data is untouched
clock.clearPreview();

const policy = createPermissionPolicy({
  roles: { admin: ['*', '-billing:manage'], viewer: ['deals:read'] },
});
```

## Rules for changes

- Additive changes only, unless every consumer is updated in the same change.
  Contracts are shared by all packages and prototypes.
- Erasable TypeScript only (`erasableSyntaxOnly`): no parameter properties,
  enums or namespaces. Vite loads configs through Node's type stripping.
- Tests live in `tests/*.test.ts` (`core.test.ts`, `devices.test.ts`, `review.test.ts`, `session-auth.test.ts`, `theme.test.ts`, `validation.test.ts`). Run them with
  `pnpm vitest run packages/core` and type-check with
  `pnpm --filter @protoyard/core typecheck`.
