import type { DeckStageCore } from '@texuli/slides/stage-core';
import type { ComponentProps } from 'svelte';

/**
 * The stage's design-system resolver (`@texuli/player` `PlayerDesignSystems`:
 * `resolve(ref)` and an optional `mode`), read off `DeckStageCore` so this
 * package needs no direct dependency on `@texuli/player`.
 */
export type PlayerDesignSystems = NonNullable<
  ComponentProps<typeof DeckStageCore>['designSystems']
>;

/**
 * What DeckApp's `designSystems` takes: the stage's resolver, plus the `ref`
 * (`id@x.y.z`) the deck follows. A Protoyard deck document has no
 * `designSystem` field, so DeckApp puts `{ ref }` on the deck it hands the
 * stage; without `ref` the resolver is only forwarded.
 */
export interface DeckDesignSystems extends PlayerDesignSystems {
  readonly ref?: string;
}

/** The fields of a compiled design system this helper reads (`ShippedDesignSystem` has them). */
export interface DeckCompiledDesignSystem {
  readonly id: string;
  readonly version: string;
  readonly vars: Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;
}

/**
 * A deck resolver for one compiled design system (the `compiled` that
 * `protoyard ds use` exports): `ref` is `<id>@<version>`, and `resolve`
 * returns the compiled design system for that ref only (never a fetch).
 * Pass it to `<DeckApp designSystems={…}>`; the deck's own theme is then not
 * loaded, and the design system's variables paint the stage.
 */
export function deckDesignSystems(
  compiled: DeckCompiledDesignSystem,
  options: { mode?: 'light' | 'dark' } = {}
): DeckDesignSystems & { readonly ref: string } {
  const ref = `${compiled.id}@${compiled.version}`;
  return {
    ref,
    resolve: (asked: string) =>
      asked === ref ? (compiled as unknown as Readonly<Record<string, unknown>>) : undefined,
    ...(options.mode ? { mode: options.mode } : {}),
  };
}
