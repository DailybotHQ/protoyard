import type { Blueprint } from '@protoyard/blueprint';
import type { Scenario, WorldSeed } from '@protoyard/core';

export interface GenerateWorldRequest {
  blueprint: Blueprint;
  scenario: Scenario;
}

export type GenerateWorldReply = { ok: true; world: WorldSeed } | { ok: false; message: string };
