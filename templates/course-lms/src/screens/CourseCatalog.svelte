<script lang="ts">
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { CAPABILITIES } from '../domain/policy.ts';
import { useCourseLms } from '../lib/context.ts';

const { db, services } = useCourseLms();
const principal = usePrincipal();
const courses = liveQuery(
  async () => (await db.courses.toArray()).sort((a, b) => a.title.localeCompare(b.title)),
  { initial: [] }
);
const lessons = liveQuery(() => db.lessons.toArray(), { initial: [] });
const enrollments = liveQuery(() => db.enrollments.toArray(), { initial: [] });
const progress = liveQuery(() => db.lessonProgress.toArray(), { initial: [] });
const quizzes = liveQuery(() => db.quizzes.toArray(), { initial: [] });
const attempts = liveQuery(() => db.quizAttempts.orderBy('attemptedAt').reverse().toArray(), {
  initial: [],
});
let answers = $state<Record<string, Record<string, number>>>({});
let messages = $state<Record<string, string>>({});
const canComplete = $derived(can(CAPABILITIES.lessonsComplete));
const actorId = $derived(principal.current?.persona.id ?? '');

function setAnswer(quizId: string, questionId: string, value: string) {
  answers = {
    ...answers,
    [quizId]: { ...(answers[quizId] ?? {}), [questionId]: Number(value) },
  };
}

async function completeLesson(lessonId: string) {
  delete messages[lessonId];
  const result = await runService(() => services.lessons.complete(lessonId), {
    success: 'Lesson completed',
  });
  if (!result.ok)
    messages[lessonId] =
      'Lesson completion did not save. Check your role or network and try again.';
}

async function submitQuiz(quizId: string, questionIds: string[]) {
  delete messages[quizId];
  const submitted = answers[quizId] ?? {};
  if (questionIds.some((questionId) => submitted[questionId] === undefined)) {
    messages[quizId] = 'Choose an answer for every question first.';
    return;
  }
  const result = await runService(() => services.quizzes.submit({ quizId, answers: submitted }), {
    success: 'Quiz graded',
  });
  if (result.ok) {
    delete messages[quizId];
  } else {
    messages[quizId] = 'Quiz submission did not save. Check your role or network and try again.';
  }
}
</script>

<header class="mb-6">
  <p class="text-sm font-medium text-primary">Fieldnote Academy · learner space</p>
  <h1 class="text-3xl font-semibold tracking-tight">Course catalog</h1>
  <p class="mt-2 max-w-2xl text-muted-foreground">Read a lesson, mark your progress and check what you learned with a short quiz. All course activity is simulated and stored in this browser.</p>
</header>

{#if courses.error}
  <ErrorState title="Could not load courses" message={String(courses.error)} />
{:else if courses.current === undefined}
  <Skeleton class="h-56 w-full rounded-xl" />
{:else if courses.current.length === 0}
  <EmptyState title="No courses published yet" description="An instructor can add the first course to this academy." />
{:else}
  <div class="grid gap-5 lg:grid-cols-2">
    {#each courses.current.filter((course) => course.published) as course (course.id)}
      {@const courseLessons = (lessons.current ?? []).filter((lesson) => lesson.courseId === course.id).sort((a, b) => a.order - b.order)}
      {@const enrolled = (enrollments.current ?? []).some((item) => item.courseId === course.id && item.studentId === actorId)}
      {@const quiz = (quizzes.current ?? []).find((item) => item.courseId === course.id)}
      {@const latestAttempt = quiz ? (attempts.current ?? []).find((attempt) => attempt.quizId === quiz.id && attempt.studentId === actorId) : undefined}
      <article aria-labelledby={`course-title-${course.id}`}>
      <Card class="space-y-5 p-5">
        <div>
          <p class="text-sm font-medium text-primary">Course</p>
          <h2 id={`course-title-${course.id}`} class="mt-1 text-xl font-semibold">{course.title}</h2>
          <p class="mt-2 text-sm text-muted-foreground">{course.description}</p>
          <p class="mt-2 text-xs text-muted-foreground">{courseLessons.length} lessons · {enrolled ? 'Enrolled' : 'Preview'}</p>
        </div>
        <ol class="space-y-3">
          {#each courseLessons as lesson (lesson.id)}
            {@const completed = (progress.current ?? []).some((item) => item.lessonId === lesson.id && item.studentId === actorId)}
            <li class="rounded-lg border border-border p-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <h3 class="font-medium">{lesson.order + 1}. {lesson.title}</h3>
                  <p class="mt-1 text-sm leading-relaxed text-muted-foreground">{lesson.body}</p>
                </div>
                {#if canComplete && enrolled}
                  {#if completed}
                    <span class="rounded-full bg-muted px-3 py-1 text-xs font-medium">Completed</span>
                  {:else}
                    <Button size="sm" onclick={() => completeLesson(lesson.id)}>Mark complete</Button>
                  {/if}
                {/if}
              </div>
              {#if messages[lesson.id]}<p class="mt-2 text-sm text-destructive" role="alert">{messages[lesson.id]}</p>{/if}
            </li>
          {/each}
        </ol>

        {#if quiz && can(CAPABILITIES.quizzesSubmit) && enrolled}
          {@const questionIds = quiz.questions.map((question) => question.id)}
          <section aria-labelledby={`quiz-${quiz.id}`} class="space-y-4 border-t border-border pt-4">
            <div>
              <h3 id={`quiz-${quiz.id}`} class="font-semibold">{quiz.title}</h3>
              <p class="text-xs text-muted-foreground">Pass with {quiz.passingScore}% or higher.</p>
            </div>
            {#each quiz.questions as question (question.id)}
              <fieldset class="space-y-2">
                <legend class="text-sm font-medium">{question.prompt}</legend>
                {#each question.choices as choice, index (index)}
                  <label class="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm">
                    <input
                      type="radio"
                      name={`${quiz.id}-${question.id}`}
                      value={index}
                      aria-label={choice}
                      checked={answers[quiz.id]?.[question.id] === index}
                      onchange={(event) => setAnswer(quiz.id, question.id, event.currentTarget.value)}
                    />
                    <span>{choice}</span>
                  </label>
                {/each}
              </fieldset>
            {/each}
            {#if latestAttempt}<p class="text-sm" role="status">Latest attempt: {latestAttempt.score}% · {latestAttempt.passed ? 'Passed' : 'Not passed yet'}</p>{/if}
            <Button onclick={() => submitQuiz(quiz.id, questionIds)}>
              Submit {quiz.title} quiz
            </Button>
            {#if messages[quiz.id]}<p class="text-sm" role="status">{messages[quiz.id]}</p>{/if}
          </section>
        {/if}
      </Card>
      </article>
    {/each}
  </div>
{/if}
