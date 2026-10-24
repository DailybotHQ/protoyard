/**
 * Map Protoyard interactive blocks to Texuli interactive shapes.
 * Texuli poll/quiz/calculator/checklist are ephemeral (local state).
 * Protoyard BlockStateHost remains for form/counter/chart-controls/reveal/tabs.
 */
import type { Block, CalculatorBlock, PollBlock, QuizBlock } from '@protoyard/blocks';

export function toTexuliPollBlock(block: PollBlock): unknown {
  return {
    type: 'poll',
    id: block.id,
    tone: block.tone,
    question: block.question,
    options: block.options,
    allowMultiple: (block.maxChoices ?? 1) > 1,
  };
}

export function toTexuliQuizBlock(block: QuizBlock): unknown {
  return {
    type: 'quiz',
    id: block.id,
    tone: block.tone,
    title: block.title,
    questions: (block.questions ?? []).map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: (q.choices ?? []).map((c) => ({ id: c.id, label: c.label })),
      correctId: q.answers[0],
      explanation: q.explanation,
    })),
  };
}

export function toTexuliCalculatorBlock(block: CalculatorBlock): unknown {
  const primary = block.outputs[0];
  return {
    type: 'calculator',
    id: block.id,
    tone: block.tone,
    title: block.title,
    description: block.description,
    inputs: (block.inputs ?? []).map((input) => ({
      name: input.name,
      label: input.label,
      min: input.min,
      max: input.max,
      step: input.step,
      default: input.default,
    })),
    formula: primary?.formula,
    unit: primary?.unit,
    outputLabel: primary?.label,
  };
}

export function toTexuliInteractiveBlock(block: Block): unknown {
  if (block.type === 'poll') return toTexuliPollBlock(block);
  if (block.type === 'quiz') return toTexuliQuizBlock(block);
  if (block.type === 'calculator') return toTexuliCalculatorBlock(block);
  return block;
}

export const TEXULI_INTERACTIVE_TYPES = new Set(['poll', 'quiz', 'calculator', 'checklist']);
export const PROTOYARD_INTERACTIVE_EXTENSIONS = new Set([
  'form',
  'counter',
  'chart-controls',
  'reveal',
  'tabs',
]);
