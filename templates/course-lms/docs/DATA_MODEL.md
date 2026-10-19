# Data model

All domain rows live in the prototype's Dexie database. Course seeds use fixed
fictional content; generator dates and cohort schedules are anchored to each
scenario's simulated reference time.

| Table | Purpose | Important links |
| --- | --- | --- |
| `courses` | Published course title, description, instructor and cohort | instructor → persona; cohort → `cohorts` |
| `lessons` | Ordered text lesson content | course → `courses` |
| `cohorts` | Fictional learner groups and date range | — |
| `enrollments` | Student membership in a course and cohort | course, student persona, cohort |
| `lessonProgress` | One completion timestamp per student and lesson | course, lesson, student persona |
| `quizzes` | Questions, choices, correct indexes and passing score | course → `courses` |
| `quizAttempts` | Submitted answers, calculated score and pass state | quiz, student persona |
| `cohortSessions` | Stable scheduled meeting slots | cohort, course |

`lessonProgress.id` is stable per lesson and student, making completion
idempotent. Quiz attempts receive runtime ids and preserve each submission.
This browser simulation does not represent a real LMS or official academic
record.
