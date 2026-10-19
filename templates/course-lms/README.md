# Course LMS

Fieldnote Academy is a fictional learning workspace template. Learners browse
courses, read lessons, persist completion and submit graded quizzes. Instructors
review course progress and seeded cohort sessions. The runtime is local to the
browser; roles and grades are simulated, not a real credential or education
record system.

```bash
pnpm protoyard new my-academy --template course-lms
pnpm protoyard dev my-academy
```

## What works

- **Course catalog and lesson player** — published course descriptions and
  text lessons are seeded deterministically. Enrolled students can mark each
  lesson complete; completion timestamps and quiz attempts persist in
  IndexedDB.
- **Graded quizzes** — services validate every answer and calculate a score
  against each quiz's passing threshold. An instructor cannot submit a learner
  attempt, and a student cannot open instructor analytics.
- **Cohort schedule** — `@protoyard/scenarios` `schedule()` generates stable
  session slots from the selected scenario seed and simulated reference time.
- **Instructor analytics** — course enrollment progress is shown in an
  accessible chart that loads only when the instructor overview is opened.
- **Scenarios** — learner in progress, instructor cohort review, empty catalog
  and network offline. Offline lesson and quiz mutations preserve stored rows
  and show simulated errors.

## Checks

```bash
pnpm vitest run templates/course-lms
pnpm --filter @protoyard-template/course-lms typecheck
pnpm protoyard validate course-lms --strict-spec --build
pnpm protoyard budget course-lms
```

Charts are imported from the `@protoyard/charts-ui/cartesian` subpath only by
the lazy instructor chart. They are not exported through `@protoyard/ui`.
