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

export function outgoingEdges(
  graph: RoadGraph,
  mode: TaxiMode,
  nodeId: NodeId,
  arrivedVia: EdgeId | null,
): GraphEdge[] {
  const out = edgesForMode(graph, mode).filter((e) => e.from === nodeId);
  if (!arrivedVia) return out;

  const forbidden = new Set(
    graph.turnRestrictions
      .filter((r) => r.at === nodeId && r.viaEdge === arrivedVia)
      .map((r) => r.forbiddenTo),
  );
  return out.filter((e) => !forbidden.has(e.id));
}

/** Dijkstra on directed edges; state is node only (turn bans applied at expansion). */
export function shortestPath(
  graph: RoadGraph,
  mode: TaxiMode,
  from: NodeId,
  to: NodeId,
): PathResult | null {
  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, { node: NodeId; edge: EdgeId }>();
  const arrivedVia = new Map<NodeId, EdgeId | null>();

  dist.set(from, 0);
  arrivedVia.set(from, null);

  const queue = new Set<NodeId>([from]);

  while (queue.size > 0) {
    let u: NodeId | null = null;
    let best = Infinity;
    for (const id of queue) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) break;
    queue.delete(u);
    if (u === to) break;

    const via = arrivedVia.get(u) ?? null;
    for (const edge of outgoingEdges(graph, mode, u, via)) {
      const alt = best + edge.lengthM;
      const current = dist.get(edge.to) ?? Infinity;
      if (alt < current) {
        dist.set(edge.to, alt);
        prev.set(edge.to, { node: u, edge: edge.id });
        arrivedVia.set(edge.to, edge.id);
        queue.add(edge.to);
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
