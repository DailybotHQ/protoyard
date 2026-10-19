# Screens

## Course catalog (`#/`)

Responsive course cards show lesson text, enrollment, completion state and
graded quiz questions. Empty, loading and failure states are explicit. A
student sees lesson and quiz controls only for courses they are enrolled in.

## Instructor overview (`#/instructor`)

This route is available to the instructor persona. It loads an accessible
completed-lessons chart on demand and lists the next generated cohort sessions.
The chart uses `@protoyard/charts-ui/cartesian` through a lazy import.
