<script lang="ts">
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
} from '@protoyard/ui';
import { Box, Heading, Text } from 'texuli/typography';
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
  <Text size="sm" weight="medium" tone="primary">Fieldnote Academy · learner space</Text>
  <Heading level={1} size="xl">Course catalog</Heading>
  <Text tone="muted" class="mt-2 max-w-2xl">Read a lesson, mark your progress and check what you learned with a short quiz. All course activity is simulated and stored in this browser.</Text>
</header>

{#if courses.error}
  <ErrorState title="Could not load courses" message={String(courses.error)} />
{:else if courses.current === undefined}
  <Skeleton class="h-56 w-full" />
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
          <Text size="sm" weight="medium" tone="primary">Course</Text>
          <Heading level={2} size="lg" id={`course-title-${course.id}`} class="mt-1">{course.title}</Heading>
          <Text size="sm" tone="muted" class="mt-2">{course.description}</Text>
          <Text size="xs" tone="muted" class="mt-2">{courseLessons.length} lessons · {enrolled ? 'Enrolled' : 'Preview'}</Text>
        </div>
        <ol class="space-y-3">
          {#each courseLessons as lesson (lesson.id)}
            {@const completed = (progress.current ?? []).some((item) => item.lessonId === lesson.id && item.studentId === actorId)}
            <li>
              <Box border="default" radius="lg" padding="none" class="p-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <Heading level={3} size="sm">{lesson.order + 1}. {lesson.title}</Heading>
                  <Text size="sm" tone="muted" class="mt-1">{lesson.body}</Text>
                </div>
                {#if canComplete && enrolled}
                  {#if completed}
                    <Badge variant="secondary">Completed</Badge>
                  {:else}
                    <Button size="sm" onclick={() => completeLesson(lesson.id)}>Mark complete</Button>
                  {/if}
                {/if}
              </div>
              {#if messages[lesson.id]}<Text size="sm" tone="destructive" role="alert" class="mt-2">{messages[lesson.id]}</Text>{/if}
              </Box>
            </li>
          {/each}
        </ol>

        {#if quiz && can(CAPABILITIES.quizzesSubmit) && enrolled}
          {@const questionIds = quiz.questions.map((question) => question.id)}
          <Box as="section" aria-labelledby={`quiz-${quiz.id}`} border="block-start" radius="none" padding="none" class="space-y-4 pt-4">
            <div>
              <Heading level={3} size="sm" id={`quiz-${quiz.id}`}>{quiz.title}</Heading>
              <Text size="xs" tone="muted">Pass with {quiz.passingScore}% or higher.</Text>
            </div>
            {#each quiz.questions as question (question.id)}
              <fieldset class="space-y-2">
                <legend><Text as="span" size="sm" weight="medium">{question.prompt}</Text></legend>
                <RadioGroup
                  aria-label={question.prompt}
                  name={`${quiz.id}-${question.id}`}
                  value={String(answers[quiz.id]?.[question.id] ?? '')}
                  onValueChange={(value) => setAnswer(quiz.id, question.id, value)}
                >
                  {#each question.choices as choice, index (index)}
                    <RadioGroupItem value={String(index)} label={choice} />
                  {/each}
                </RadioGroup>
              </fieldset>
            {/each}
            {#if latestAttempt}<Text size="sm" role="status">Latest attempt: {latestAttempt.score}% · {latestAttempt.passed ? 'Passed' : 'Not passed yet'}</Text>{/if}
            <Button onclick={() => submitQuiz(quiz.id, questionIds)}>
              Submit {quiz.title} quiz
            </Button>
            {#if messages[quiz.id]}<Text size="sm" role="status">{messages[quiz.id]}</Text>{/if}
          </Box>
        {/if}
      </Card>
      </article>
    {/each}
  </div>
{/if}
