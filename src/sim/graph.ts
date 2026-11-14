import type {
  EdgeId,
  GraphEdge,
  NodeId,
  PathResult,
  RoadGraph,
  TaxiMode,
} from "./types";

export function edgesForMode(graph: RoadGraph, mode: TaxiMode): GraphEdge[] {
  return Object.values(graph.edges).filter((e) => e.taxiTypes.includes(mode));
}

/** Adjacency cache — highway graphs are large; rebuild when graph identity changes. */
const adjCache = new WeakMap<
  RoadGraph,
  Map<string, Map<NodeId, GraphEdge[]>>
>();

function adjacency(
  graph: RoadGraph,
  mode: TaxiMode,
): Map<NodeId, GraphEdge[]> {
  let byMode = adjCache.get(graph);
  if (!byMode) {
    byMode = new Map();
    adjCache.set(graph, byMode);
  }
  const key = mode;
  let adj = byMode.get(key);
  if (adj) return adj;

  adj = new Map();
  for (const e of Object.values(graph.edges)) {
    if (!e.taxiTypes.includes(mode)) continue;
    let list = adj.get(e.from);
    if (!list) {
      list = [];
      adj.set(e.from, list);
    }
    list.push(e);
  }
  byMode.set(key, adj);
  return adj;
}

export function outgoingEdges(
  graph: RoadGraph,
  mode: TaxiMode,
  nodeId: NodeId,
  arrivedVia: EdgeId | null,
): GraphEdge[] {
  const out = adjacency(graph, mode).get(nodeId) ?? [];
  if (!arrivedVia) return out.slice();

  const forbidden = new Set(
    graph.turnRestrictions
      .filter((r) => r.at === nodeId && r.viaEdge === arrivedVia)
      .map((r) => r.forbiddenTo),
  );
  return out.filter((e) => !forbidden.has(e.id));
}

class MinHeap {
  private data: { id: NodeId; dist: number }[] = [];

  get size() {
    return this.data.length;
  }

  push(id: NodeId, dist: number) {
    const data = this.data;
    data.push({ id, dist });
    let i = data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (data[p]!.dist <= data[i]!.dist) break;
      const tmp = data[p]!;
      data[p] = data[i]!;
      data[i] = tmp;
      i = p;
    }
  }

  pop() {
    const data = this.data;
    if (data.length === 0) return null;
    const top = data[0]!;
    const last = data.pop()!;
    if (data.length) {
      data[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < data.length && data[l]!.dist < data[smallest]!.dist)
          smallest = l;
        if (r < data.length && data[r]!.dist < data[smallest]!.dist)
          smallest = r;
        if (smallest === i) break;
        const tmp = data[i]!;
        data[i] = data[smallest]!;
        data[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Dijkstra on directed edges with turn bans applied at expansion.
 * Heap-based for large highway graphs.
 */
export function shortestPath(
  graph: RoadGraph,
  mode: TaxiMode,
  from: NodeId,
  to: NodeId,
): PathResult | null {
  if (from === to) return { edgeIds: [], nodeIds: [from], lengthM: 0 };
  if (!graph.nodes[from] || !graph.nodes[to]) return null;

  const adj = adjacency(graph, mode);
  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, { node: NodeId; edge: EdgeId }>();
  const arrivedVia = new Map<NodeId, EdgeId | null>();
  const heap = new MinHeap();

  dist.set(from, 0);
  arrivedVia.set(from, null);
  heap.push(from, 0);

  while (heap.size > 0) {
    const cur = heap.pop()!;
    const best = dist.get(cur.id);
    if (best === undefined || cur.dist > best) continue;
    if (cur.id === to) break;

    const via = arrivedVia.get(cur.id) ?? null;
    const outs = adj.get(cur.id) ?? [];
    for (const edge of outs) {
      if (via) {
        const banned = graph.turnRestrictions.some(
          (r) =>
            r.at === cur.id &&
            r.viaEdge === via &&
            r.forbiddenTo === edge.id,
        );
        if (banned) continue;
      }
      const alt = best + edge.lengthM;
      const known = dist.get(edge.to);
      if (known === undefined || alt < known) {
        dist.set(edge.to, alt);
        prev.set(edge.to, { node: cur.id, edge: edge.id });
        arrivedVia.set(edge.to, edge.id);
        heap.push(edge.to, alt);
      }
    }
  }

  if (!dist.has(to)) return null;

  const edgeIds: EdgeId[] = [];
  const nodeIds: NodeId[] = [to];
  let cur: NodeId = to;
  while (cur !== from) {
    const step = prev.get(cur);
    if (!step) return null;
    edgeIds.unshift(step.edge);
    nodeIds.unshift(step.node);
    cur = step.node;
  }

  return {
    edgeIds,
    nodeIds,
    lengthM: dist.get(to) ?? 0,
  };
}

export function pathEdges(graph: RoadGraph, edgeIds: EdgeId[]): GraphEdge[] {
  return edgeIds.map((id) => {
    const edge = graph.edges[id];
    if (!edge) throw new Error(`Missing edge ${id}`);
    return edge;
  });
}
