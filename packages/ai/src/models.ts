import type { AiModel } from './types.ts';

/** Fictional catalog. All listed models are simulations and never call a provider. */
export const AI_MODELS: readonly AiModel[] = [
  {
    id: 'py-orbit-small',
    name: 'Orbit Small',
    provider: 'Protoyard Simulations',
    contextWindow: 16_000,
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 0.8,
    simulated: true,
  },
  {
    id: 'py-orbit-pro',
    name: 'Orbit Pro',
    provider: 'Protoyard Simulations',
    contextWindow: 64_000,
    inputCostPerMillion: 2,
    outputCostPerMillion: 8,
    simulated: true,
  },
  {
    id: 'py-orbit-long',
    name: 'Orbit Long',
    provider: 'Protoyard Simulations',
    contextWindow: 128_000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 4,
    simulated: true,
  },
];
