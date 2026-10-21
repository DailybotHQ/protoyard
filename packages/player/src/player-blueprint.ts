import type { AppModel, Blueprint } from '@protoyard/blueprint';

/**
 * The blueprint the mounted app renders. `mountPrototype` mounts the App
 * component without props, so `bootPlayer` sets this before mounting.
 */
let current: { blueprint: Blueprint; model: AppModel } | null = null;

export function setPlayerBlueprint(value: { blueprint: Blueprint; model: AppModel }): void {
  current = value;
}

export function playerBlueprint(): { blueprint: Blueprint; model: AppModel } {
  if (!current) throw new Error('bootPlayer() must set the blueprint before the app mounts');
  return current;
}
