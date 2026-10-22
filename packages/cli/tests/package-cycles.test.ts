import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Workspace packages must form a DAG: a dependency cycle breaks build:packages ordering and
 * packed installs (for example blueprint -> pages -> blueprint). Runtime dependencies only.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Known debt from before PLAN_005: views-ui imports renderer-svelte while renderer-svelte reaches
 * views-ui through review-ui. Svelte packaging tolerates it today; no new cycle may be added.
 * Remove this entry when the edge is broken.
 */
const KNOWN_EDGES = new Set(['@protoyard/views-ui -> @protoyard/renderer-svelte']);

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function workspaceGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const dir of readdirSync(join(ROOT, 'packages'))) {
    const file = join(ROOT, 'packages', dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
    graph.set(
      pkg.name,
      Object.entries(deps)
        .filter(([, spec]) => spec.startsWith('workspace:'))
        .map(([name]) => name)
        .filter((name) => !KNOWN_EDGES.has(`${pkg.name} -> ${name}`))
    );
  }
  return graph;
}

export function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null;
    if (state.get(node) === 'visiting') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of [...graph.keys()].sort()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

describe('workspace package graph', () => {
  it('has no dependency cycles', () => {
    const graph = workspaceGraph();
    expect(graph.size).toBeGreaterThan(20);
    expect(findCycle(graph)).toBeNull();
  });

  it('detects a planted cycle', () => {
    const graph = new Map([
      ['@x/a', ['@x/b']],
      ['@x/b', ['@x/c']],
      ['@x/c', ['@x/a']],
    ]);
    expect(findCycle(graph)).toEqual(['@x/a', '@x/b', '@x/c', '@x/a']);
  });
});
