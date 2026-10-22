import { type AnyBlueprint, type Blueprint, isAppBlueprint } from '@protoyard/blueprint';
import type { BootedPlayer, BootPlayerOptions } from '../boot.ts';
import type { BootKindOptions } from '../boot-kind.ts';

/**
 * The one place the player chooses a boot path by blueprint kind (ADR-036):
 * an app goes to `boot.ts` (the CRUD shell, the world worker, Faker), a deck,
 * page or doc to `boot-kind.ts` (the kind runtime and its renderer). Each is
 * its own lazy chunk, so a deck never downloads the app boot and an app never
 * downloads the kind renderers.
 */

/** Per-boot settings shared by both paths (live reload, review comments). */
export type BootExtras = Pick<BootPlayerOptions, 'namespace' | 'generatorVersion' | 'review'>;

export const loadAppBoot = () => import('../boot.ts');
export const loadKindBoot = () => import('../boot-kind.ts');

/** Starts fetching the chunk this blueprint will boot with (no work for the other kind). */
export function prefetchBoot(blueprint: AnyBlueprint): void {
  void (isAppBlueprint(blueprint) ? loadAppBoot() : loadKindBoot()).catch(() => undefined);
}

export async function bootByKind(
  blueprint: AnyBlueprint,
  target: HTMLElement,
  extras: BootExtras = {}
): Promise<BootedPlayer> {
  if (isAppBlueprint(blueprint)) {
    const { bootPlayer } = await loadAppBoot();
    return bootPlayer({ blueprint: blueprint as Blueprint, target, ...extras });
  }
  const { bootKind } = await loadKindBoot();
  const options: BootKindOptions = { blueprint, target, ...extras };
  return bootKind(options);
}
