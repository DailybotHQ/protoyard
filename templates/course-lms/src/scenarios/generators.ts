import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool, schedule } from '@protoyard/scenarios';
import type {
  Cohort,
  CohortSession,
  Course,
  Enrollment,
  Lesson,
  LessonProgress,
  Quiz,
} from '../database/schema.ts';

const PEOPLE = [
  { id: 'user_0001', name: 'Jamie Park', title: 'Learning designer', role: 'instructor' },
  { id: 'user_0002', name: 'Alex Morgan', title: 'Product learner', role: 'student' },
  { id: 'user_0003', name: 'Rory Chen', title: 'Research learner', role: 'student' },
  { id: 'user_0004', name: 'Taylor Reed', title: 'Academy observer', role: 'viewer' },
] as const;

const COURSE_BLUEPRINTS = [
  {
    id: 'course_research',
    title: 'Research Foundations',
    description: 'Plan interviews, ask open questions and turn observations into useful themes.',
    lessons: [
      {
        id: 'lesson_research_01',
        title: 'Ask better questions',
        body: 'Start with a real decision. Ask people to describe the last time it happened, then listen for context instead of pitching a solution.',
      },
      {
        id: 'lesson_research_02',
        title: 'Plan a short interview',
        body: 'Write a small set of neutral prompts. Leave room for follow-up questions and make the session purpose clear to each participant.',
      },
      {
        id: 'lesson_research_03',
        title: 'Synthesize observations',
        body: 'Group concrete observations by repeated need. Keep the participant quote beside each theme so the team can revisit the evidence.',
      },
    ],
    quiz: {
      id: 'quiz_research',
      title: 'Interview basics',
      questions: [
        {
          id: 'research_q1',
          prompt: 'Which prompt invites a useful story?',
          choices: ['Would you use this feature?', 'Tell me about the last time this happened.'],
          correctIndex: 1,
        },
        {
          id: 'research_q2',
          prompt: 'What should a research question avoid?',
          choices: ['Suggesting the answer', 'Asking for a concrete example'],
          correctIndex: 0,
        },
      ],
    },
  },
  {
    id: 'course-accessibility',
    title: 'Accessible Product Writing',
    description: 'Write clear labels, helpful errors and instructions that work across devices.',
    lessons: [
      {
        id: 'lesson_access_01',
        title: 'Name actions clearly',
        body: 'Use concise verbs that describe the result. A control should make sense in context and when heard on its own.',
      },
      {
        id: 'lesson_access_02',
        title: 'Write recoverable errors',
        body: 'Explain what failed and offer a next step. Keep entered work when a retry is possible.',
      },
    ],
    quiz: {
      id: 'quiz_accessibility',
      title: 'Clear interface copy',
      questions: [
        {
          id: 'access_q1',
          prompt: 'A useful error message should include…',
          choices: ['Only a technical code', 'What happened and what to try next'],
          correctIndex: 1,
        },
        {
          id: 'access_q2',
          prompt: 'A button label is clearest when it…',
          choices: ['Describes the action', 'Uses an unexplained abbreviation'],
          correctIndex: 0,
        },
      ],
    },
  },
  {
    id: 'course-data-story',
    title: 'Tell a Data Story',
    description:
      'Choose a useful comparison and explain what changed without overstating the evidence.',
    lessons: [
      {
        id: 'lesson_data_01',
        title: 'Start with a decision',
        body: 'Choose the audience and the decision first. A chart should answer a focused question rather than display every available measure.',
      },
      {
        id: 'lesson_data_02',
        title: 'Compare like with like',
        body: 'Keep units and time windows consistent. Show the source and limitations next to the conclusion.',
      },
    ],
    quiz: {
      id: 'quiz_data',
      title: 'Evidence and comparison',
      questions: [
        {
          id: 'data_q1',
          prompt: 'A fair comparison uses…',
          choices: ['Different time windows', 'The same units and time windows'],
          correctIndex: 1,
        },
      ],
    },
  },
] as const;

function identityRows(ctx: GenerateContext) {
  const createdAt = ctx.time.iso(ctx.time.daysAgo(ctx.scenario.organization.ageDays));
  const organization: Organization = {
    id: ctx.scenario.organization.id,
    name: ctx.scenario.organization.name ?? 'Fieldnote Academy',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt,
    size: PEOPLE.length,
    featureFlags: {},
  };
  const faces = createAvatarPool(ctx.rng.fork('course-lms:avatars'));
  const personas: Persona[] = PEOPLE.map((person, index) => ({
    id: person.id,
    name: person.name,
    title: person.title,
    avatar: faces.next(),
    email: `${person.name.split(' ')[0]?.toLowerCase()}@example.com`,
    avatarColor: ['#4f46e5', '#0284c7', '#059669', '#d97706'][index] ?? '#475569',
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: ctx.time.iso(
      ctx.time.daysAgo(Math.min(ctx.scenario.organization.ageDays, index * 4))
    ),
    onboardingComplete: true,
    preferences: {},
    summary: person.title,
  }));
  const memberships: Membership[] = PEOPLE.map((person, index) => ({
    id: `membership_${String(index + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: organization.id,
    role: person.role,
    joinedAt: personas[index]?.joinedAt ?? createdAt,
    capabilities: [],
  }));
  return { organization, personas, memberships };
}

export function generateCourseWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identityRows(ctx);
  const requested = Number(ctx.scenario.generators.courses ?? COURSE_BLUEPRINTS.length);
  const courseCount = Math.max(
    0,
    Math.min(COURSE_BLUEPRINTS.length, Number.isFinite(requested) ? requested : 0)
  );
  const selected = COURSE_BLUEPRINTS.slice(0, courseCount);
  const cohorts: Cohort[] = [
    {
      id: 'cohort_north',
      name: 'North cohort',
      startDate: ctx.time.iso(ctx.time.daysAgo(7)).slice(0, 10),
      endDate: ctx.time.iso(ctx.time.daysAgo(-28)).slice(0, 10),
    },
    {
      id: 'cohort_south',
      name: 'South cohort',
      startDate: ctx.time.iso(ctx.time.daysAgo(3)).slice(0, 10),
      endDate: ctx.time.iso(ctx.time.daysAgo(-32)).slice(0, 10),
    },
  ];
  const courses: Course[] = selected.map((course, index) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    instructorId: 'user_0001',
    cohortId: cohorts[index % cohorts.length]?.id ?? 'cohort_north',
    published: true,
  }));
  const lessons: Lesson[] = [];
  const quizzes: Quiz[] = [];
  for (const course of selected) {
    lessons.push(
      ...course.lessons.map((lesson, order) => ({
        ...lesson,
        courseId: course.id,
        order,
      }))
    );
    quizzes.push({
      ...course.quiz,
      questions: course.quiz.questions.map((question) => ({
        ...question,
        choices: [...question.choices],
      })),
      courseId: course.id,
      passingScore: 70,
    });
  }
  const students = personas.filter(
    (person) => person.id === 'user_0002' || person.id === 'user_0003'
  );
  const enrolledAt = ctx.time.iso(ctx.time.daysAgo(10));
  const enrollments: Enrollment[] = courses.flatMap((course) =>
    students.map((student) => ({
      id: `${course.id}:${student.id}`,
      courseId: course.id,
      studentId: student.id,
      cohortId: course.cohortId,
      enrolledAt,
    }))
  );
  const completedCount = Math.max(0, Number(ctx.scenario.generators.completedLessons ?? 0));
  const lessonProgress: LessonProgress[] = enrollments.flatMap((enrollment) =>
    lessons
      .filter((lesson) => lesson.courseId === enrollment.courseId && lesson.order < completedCount)
      .map((lesson) => ({
        id: `${lesson.id}:${enrollment.studentId}`,
        courseId: lesson.courseId,
        lessonId: lesson.id,
        studentId: enrollment.studentId,
        completedAt: ctx.time.iso(ctx.time.daysAgo(2 + (lesson.order % 3))),
      }))
  );
  const courseByCohort = new Map(courses.map((course) => [course.cohortId, course.id]));
  const scheduled = schedule({
    ctx,
    resources: cohorts.map((cohort) => cohort.id),
    window: { daysBefore: 7, daysAfter: 21 },
    businessHours: [10, 16],
    slotMinutes: 60,
    durations: [1, 2],
    occupancy: 0.35,
    recurring: [
      {
        label: 'Weekly seminar',
        every: 'weekly',
        weekday: 3,
        startMinute: 11 * 60,
        durationMinutes: 60,
      },
    ],
  });
  const cohortSessions: CohortSession[] = scheduled.flatMap((slot) => {
    const courseId = courseByCohort.get(slot.resourceId);
    return courseId
      ? [
          {
            id: slot.id,
            cohortId: slot.resourceId,
            courseId,
            start: slot.start,
            end: slot.end,
            durationMinutes: slot.durationMinutes,
            status: slot.status,
          },
        ]
      : [];
  });

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      courses,
      lessons,
      cohorts,
      enrollments,
      lessonProgress,
      quizzes,
      quizAttempts: [],
      cohortSessions,
    },
  };
}
