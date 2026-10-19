import { createRng, hashString } from '@protoyard/core';
import type { ResponsePack } from './types.ts';

const REFUSAL =
  /\b(make|build|write|give|show|explain)\b.{0,40}\b(bomb|malware|ransomware|steal passwords|credential theft)\b/i;

export const refusalPack: ResponsePack = {
  id: 'safety-refusal',
  name: 'Safety refusal',
  generate: () =>
    'I can’t help with instructions that could cause harm. I can help with prevention, safety, or a benign alternative.',
};

export const generalAssistantPack: ResponsePack = {
  id: 'general-assistant',
  name: 'General assistant',
  generate: ({ prompt, rng }) => {
    const clean = prompt.trim().replace(/\s+/g, ' ');
    const answer = rng.pick([
      `Here is a practical way to approach that: start by clarifying the outcome, then break it into small steps. You asked: “${clean}”`,
      `A useful starting point is to make the goal concrete and check each assumption as you go. For “${clean}”, I would begin with one small experiment.`,
      `Let’s make this manageable. First identify what success looks like for “${clean}”, then choose the simplest next action that tests it.`,
    ]);
    return answer;
  },
};

export const DEFAULT_RESPONSE_PACKS: readonly ResponsePack[] = [generalAssistantPack, refusalPack];

export function scriptedPack(id: string, responses: readonly string[]): ResponsePack {
  if (responses.length === 0) throw new RangeError('scriptedPack requires at least one response');
  return {
    id,
    name: `Scripted: ${id}`,
    generate: ({ rng }) => rng.pick(responses),
  };
}

export interface Rule {
  match: RegExp;
  response: string;
}

export function ruleBasedPack(id: string, rules: readonly Rule[], fallback: string): ResponsePack {
  return {
    id,
    name: `Rules: ${id}`,
    generate: ({ prompt }) => rules.find((rule) => rule.match.test(prompt))?.response ?? fallback,
  };
}

export function templatedPack(id: string, template: string): ResponsePack {
  return {
    id,
    name: `Template: ${id}`,
    generate: ({ prompt, model }) =>
      template.replaceAll('{{prompt}}', prompt.trim()).replaceAll('{{model}}', model.name),
  };
}

/**
 * Stable pack choice from seed + normalized prompt.
 * The safety-refusal pack is returned only when `REFUSAL` matches the prompt;
 * ordinary prompts pick deterministically among the **non-refusal** packs so a
 * two-pack catalog never returns the refusal text for "hello".
 */
export function selectResponsePack(
  packs: readonly ResponsePack[],
  seed: number | string,
  prompt: string,
  /** Deterministic attempt index so regenerate can vary without non-determinism. */
  attempt = 0
): ResponsePack {
  if (packs.length === 0) throw new RangeError('At least one response pack is required');
  if (REFUSAL.test(prompt)) {
    const safety = packs.find((pack) => pack.id === refusalPack.id);
    if (safety) return safety;
  }
  const candidates = packs.filter((pack) => pack.id !== refusalPack.id);
  const pool = candidates.length > 0 ? candidates : packs;
  const key = `${String(seed)}:${prompt.trim().toLowerCase().replace(/\s+/g, ' ')}:${Math.max(0, Math.floor(attempt))}`;
  return pool[createRng(hashString(key)).int(0, pool.length - 1)] as ResponsePack;
}

export function responseRng(seed: number | string, prompt: string, attempt = 0) {
  return createRng(
    hashString(
      `${String(seed)}:${prompt.trim().toLowerCase().replace(/\s+/g, ' ')}:${Math.max(0, Math.floor(attempt))}`
    )
  );
}

export type { ResponseInput, ResponsePack } from './types.ts';
