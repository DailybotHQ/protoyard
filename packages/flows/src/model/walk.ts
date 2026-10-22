import type { Step } from './steps.ts';

export type BranchArm = 'then' | 'otherwise';
export type PathSegment = string | number;

/** Where a step sits in the tree. */
export interface StepLocation {
  step: Step;
  /** From the flow root, for diagnostics: `['steps', 0, 'then', 1]`. */
  path: PathSegment[];
  parentId: string | null;
  branch: BranchArm | null;
  index: number;
  /** 0 for a top-level step. */
  depth: number;
  /** The branch arms the step is inside, outermost first (`branchId:arm`). */
  arms: string[];
}

/** The arms of a step, empty for anything but a branch. */
export function childArms(step: Step): { branch: BranchArm; steps: Step[] }[] {
  if (step.type !== 'branch') return [];
  return [
    { branch: 'then', steps: step.then },
    { branch: 'otherwise', steps: step.otherwise },
  ];
}

/** Visits every step in document (pre-)order, which is also run order. */
export function walkSteps(
  steps: readonly Step[],
  visit: (location: StepLocation) => void,
  parent: {
    id: string;
    branch: BranchArm;
    path: PathSegment[];
    depth: number;
    arms: string[];
  } | null = null
): void {
  const base: PathSegment[] = parent ? [...parent.path, parent.branch] : ['steps'];
  steps.forEach((step, index) => {
    const location: StepLocation = {
      step,
      path: [...base, index],
      parentId: parent?.id ?? null,
      branch: parent?.branch ?? null,
      index,
      depth: parent ? parent.depth + 1 : 0,
      arms: parent ? [...parent.arms, `${parent.id}:${parent.branch}`] : [],
    };
    visit(location);
    for (const arm of childArms(step)) {
      walkSteps(arm.steps, visit, {
        id: step.id,
        branch: arm.branch,
        path: location.path,
        depth: location.depth,
        arms: location.arms,
      });
    }
  });
}

export function listSteps(steps: readonly Step[]): StepLocation[] {
  const out: StepLocation[] = [];
  walkSteps(steps, (location) => out.push(location));
  return out;
}

export function findStep(steps: readonly Step[], stepId: string): StepLocation | null {
  return listSteps(steps).find((location) => location.step.id === stepId) ?? null;
}

/**
 * True when `earlier` has certainly run by the time `later` starts: it comes
 * first in run order and is not inside a branch arm that `later` is outside of.
 */
export function runsBefore(
  earlier: StepLocation,
  later: StepLocation,
  order: Map<string, number>
): boolean {
  const a = order.get(earlier.step.id);
  const b = order.get(later.step.id);
  if (a === undefined || b === undefined || a >= b) return false;
  return earlier.arms.every((arm, i) => later.arms[i] === arm);
}

/** The steps whose output a step may reference. */
export function stepsBefore(steps: readonly Step[], stepId: string): Step[] {
  const all = listSteps(steps);
  const order = new Map(all.map((location, i) => [location.step.id, i]));
  const target = all.find((location) => location.step.id === stepId);
  if (!target) return [];
  return all.filter((location) => runsBefore(location, target, order)).map((l) => l.step);
}

/** `['steps', 0, 'then', 1]` → `steps[0].then[1]`. */
export function formatPath(path: readonly PathSegment[]): string {
  return path
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`
    )
    .join('');
}
