# Simulated roles and capabilities

| Role | Capabilities | Experience |
| --- | --- | --- |
| Instructor | `courses:read`, `analytics:read` | Reviews the catalog, cohort schedule and learner analytics |
| Student | `courses:read`, `lessons:complete`, `quizzes:submit` | Reads enrolled lessons, records progress and submits quizzes |
| Viewer | `courses:read` | Read-only catalog access |

Services enforce mutation capabilities even when called outside the UI. These
roles are simulated product behavior, not authentication, authorization for a
real service, or protection for course answers stored in the browser.
