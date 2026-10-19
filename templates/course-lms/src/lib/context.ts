import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { CourseLmsDatabase } from '../database/schema.ts';
import { createCourseServices } from '../domain/services.ts';

const KEY = Symbol('course-lms');

export function provideCourseLms() {
  const runtime = getRuntime() as unknown as PrototypeRuntime<CourseLmsDatabase>;
  const context = {
    runtime,
    db: runtime.db,
    services: createCourseServices(runtime),
  };
  setContext(KEY, context);
  return context;
}

export function useCourseLms() {
  const value = getContext<ReturnType<typeof provideCourseLms> | undefined>(KEY);
  if (!value) throw new Error('useCourseLms() must be called inside App.svelte');
  return value;
}
