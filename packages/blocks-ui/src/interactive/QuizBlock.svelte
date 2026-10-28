<script lang="ts">
import type { QuizBlock as QuizBlockType } from '@protoyard/blocks';
import { quizChoiceOrder, quizScore } from '@protoyard/blocks/interactive';
import { Button } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { inlineParts } from '../lib/inline.ts';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: QuizBlockType } = $props();

const ctl = useBlockState(() => block);
const feedback = $derived(block.feedback ?? 'immediate');
const score = $derived(quizScore(block, ctl.state, ctl.viewerId));
const mine = $derived(
  Object.hasOwn(ctl.state.answers, ctl.viewerId)
    ? (ctl.state.answers[ctl.viewerId] as Record<string, string[]>)
    : {}
);

function answer(questionId: string, choiceId: string, multi: boolean) {
  const current = Object.hasOwn(mine, questionId) ? [...(mine[questionId] as string[])] : [];
  let choices: string[];
  if (!multi) {
    choices = [choiceId];
  } else if (current.includes(choiceId)) {
    choices = current.filter((id) => id !== choiceId);
  } else {
    choices = [...current, choiceId];
  }
  if (choices.length === 0) return Promise.resolve(null);
  return ctl.dispatch({
    type: 'answer',
    viewer: ctl.viewerId,
    question: questionId,
    choices,
  });
}

function submit() {
  return ctl.dispatch({ type: 'submit', viewer: ctl.viewerId });
}

function reset() {
  return ctl.dispatch({ type: 'reset', viewer: ctl.viewerId });
}

function isCorrect(questionId: string): boolean | null {
  const row = score.questions.find((q) => q.id === questionId);
  if (!row?.answered) return null;
  if (feedback === 'immediate' || score.submitted) return row.correct;
  return null;
}
</script>

{#snippet rich(text: string)}
  {#each inlineParts(text) as part, i (i)}
    {#if part.mark === 'strong'}<strong>{part.text}</strong>
    {:else if part.mark === 'em'}<em>{part.text}</em>
    {:else if part.mark === 'code'}<code class="font-mono">{part.text}</code>
    {:else}{part.text}{/if}
  {/each}
{/snippet}

<section
  class="grid gap-4 rounded-lg border border-border bg-card p-4"
  data-py-block="quiz"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
  aria-labelledby="quiz-title-{block.id}"
>
  <header class="grid gap-1">
    <h3 class="text-base font-semibold text-foreground" id="quiz-title-{block.id}">
      {block.title ?? 'Quiz'}
    </h3>
    {#if block.passScore !== undefined}
      <p class="text-xs text-muted-foreground">
        Pass mark: {Math.round(block.passScore * 100)}%
      </p>
    {/if}
  </header>

  {#each block.questions as question (question.id)}
    {@const order = quizChoiceOrder(block, question.id)}
    {@const multi = question.answers.length > 1}
    {@const chosen = Object.hasOwn(mine, question.id) ? (mine[question.id] as string[]) : []}
    {@const correct = isCorrect(question.id)}
    {@const locked = score.submitted || (feedback === 'immediate' && chosen.length > 0)}
    <fieldset class="grid gap-2 rounded-md border border-border p-3" disabled={ctl.pending}>
      <legend class="px-1 text-sm font-medium text-foreground">{@render rich(question.prompt)}</legend>
      <p class="text-xs text-muted-foreground">
        {multi ? 'Select all that apply.' : 'Select one answer.'}
      </p>
      <ul class="grid gap-1.5" role="list">
        {#each order as choiceId (choiceId)}
          {@const choice = question.choices.find((c) => c.id === choiceId)}
          {#if choice}
            {@const selected = chosen.includes(choice.id)}
            <li>
              <Button
                type="button"
                class="w-full rounded-md border px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring
                  {selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}"
                aria-pressed={selected}
                disabled={locked}
                onclick={() => answer(question.id, choice.id, multi)}
              >
                <span class="font-medium">{choice.label}</span>
                {#if selected}
                  <span class="sr-only">(selected)</span>
                {/if}
              </Button>
            </li>
          {/if}
        {/each}
      </ul>
      {#if correct !== null}
        <p
          class="text-sm font-medium {correct ? 'text-success' : 'text-destructive'}"
          role="status"
          data-correct={correct}
        >
          {#if correct}
            Correct
          {:else}
            Not quite
          {/if}
          {#if question.explanation}
            <span class="font-normal text-muted-foreground"> — {@render rich(question.explanation)}</span>
          {/if}
        </p>
      {/if}
    </fieldset>
  {/each}

  <div class="flex flex-wrap gap-2">
    {#if feedback === 'end' && !score.submitted}
      <Button size="sm" loading={ctl.pending} loadingLabel="Submitting" onclick={() => submit()}>
        Submit answers
      </Button>
    {/if}
    {#if score.submitted || (feedback === 'immediate' && score.answered > 0)}
      <Button size="sm" variant="outline" loading={ctl.pending} onclick={() => reset()}>
        Try again
      </Button>
    {/if}
  </div>

  {#if score.submitted || (feedback === 'immediate' && score.answered === score.total)}
    <p class="text-sm text-foreground" role="status" aria-live="polite">
      Score: {score.correct} of {score.total}
      ({Math.round(score.ratio * 100)}%)
      {#if score.passed === true}
        — Passed
      {:else if score.passed === false}
        — Not passed
      {/if}
    </p>
  {/if}

  {#if ctl.error}
    <p class="text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
