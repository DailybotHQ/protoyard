<script lang="ts">
import { OutlineEditor, TreeView } from '@protoyard/views-ui/tree';

type Node = { id: string; parentId: string | null; rank: string; title: string };
let nodes = $state<Node[]>([
  { id: 'project', parentId: null, rank: 'a0', title: 'Website refresh' },
  { id: 'research', parentId: 'project', rank: 'a0', title: 'Research' },
  { id: 'prototype', parentId: 'project', rank: 'a1', title: 'Prototype' },
  { id: 'interviews', parentId: 'research', rank: 'a0', title: 'Interview customers' },
]);
const query = $derived({ current: nodes, loading: false, error: null });
async function createNode(input: { parentId: string | null; rank: string; title: string }) {
  const id = `node-${nodes.length + 1}`;
  nodes = [...nodes, { id, parentId: input.parentId, rank: input.rank, title: input.title }];
  return id;
}
async function renameNode(item: Node, title: string) {
  nodes = nodes.map((node) => (node.id === item.id ? { ...node, title } : node));
}
</script>
<div class="space-y-6"><section><h3 class="mb-2 text-sm font-semibold">Tree</h3><TreeView {query} getId={(item) => item.id} getParentId={(item) => item.parentId} getRank={(item) => item.rank} getLabel={(item) => item.title} /></section><section><h3 class="mb-2 text-sm font-semibold">Outline editor</h3><OutlineEditor {query} getId={(item) => item.id} getParentId={(item) => item.parentId} getRank={(item) => item.rank} getTitle={(item) => item.title} onCreate={createNode} onRename={renameNode} onMove={async () => { await Promise.resolve(); }} /></section></div>
