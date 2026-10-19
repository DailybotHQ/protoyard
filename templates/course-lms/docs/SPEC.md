# Course LMS: spec

## Problem

Small training teams need a simple way to present lessons, track learner
progress and review cohort activity. Course LMS simulates that learning
workspace in one browser without a backend.

## Users

- **Students** browse courses, read lesson text and submit quizzes.
- **Instructors** review course progress and cohort schedules.
- **Viewers** can inspect the course catalog without changing records.

See [PERMISSIONS.md](PERMISSIONS.md) for the simulated capability matrix.

## Capabilities

- Browse published courses and read ordered lessons.
- Complete an enrolled lesson and persist the simulated completion time.
- Submit answers to a graded quiz and retain score and pass state.
- See instructor analytics and seed-based cohort session schedules.
- Switch scenarios to inspect empty, learner, instructor and offline states.

The detailed state transitions are in [FLOWS.md](FLOWS.md); route behavior is
in [SCREENS.md](SCREENS.md).

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `empty-catalog` | New academy | Lifecycle | empty | 90 | `{"completedLessons":0,"courses":0}` | An instructor has set up an academy, but has not published courses yet. |
| `instructor-cohort` | Instructor cohort review | Teaching | normal | 4821 | `{"completedLessons":1,"courses":3}` | An instructor reviews learner progress and the upcoming cohort schedule. |
| `network-offline` | Learner offline | Conditions | normal | 4821 | `{"completedLessons":0,"courses":3}` | Courses remain readable while lesson completion and quiz submission fail offline. |
| `student-active` | Learner in progress | Learning | normal | 4821 | `{"completedLessons":0,"courses":3}` | A student has access to the current course catalog and can track lesson progress. |
<!-- /protoyard:generated:scenarios -->

## Non-goals

- Real accounts, remote course delivery, certification, payments or a learning
  record system.
- Remote video, media hosting, network APIs or real-time cohort meetings.
- Protecting quiz answers from a browser user; all client-side data is
  inspectable.

## Honest boundaries

Data lives in this browser's IndexedDB. Personas and policy are simulated,
service failures are scenario-controlled, and grades are local demo records.
They do not represent real authentication or official academic results.

## Rebuild as a real app

Replace local tables with an authenticated course API and enforce enrollment,
instructor access and grading on the server. Store lesson content and quiz keys
behind appropriate access rules, add audit and retention policies, and use a
real scheduler for cohort meetings. Keep the current generators as fictional
fixtures only.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.course-lms` |
| slug | `course-lms` |
| name | Course LMS |
| version | 0.1.0 |
| platform | responsive |
| category | education |
| default scenario | `student-active` |
| default theme | `violet` |
| storage namespace | `template-course-lms` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
