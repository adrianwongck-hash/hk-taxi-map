import {
  edgeBearing,
  relativeTurnDeg,
} from "../game/bearing";
import { outgoingEdges } from "./graph";
import type {
  EdgeId,
  GraphEdge,
  NodeId,
  RoadGraph,
  TaxiMode,
} from "./types";

/** Absolute relative bearing beyond which a move is treated as a U-turn. */
const UTURN_DEG = 150;

/**
 * Exits the player should consider at a node.
 * Drops the reverse/U-turn when a forward exit exists so shape-point
 * two-ways (continue + back) are not listed as a fork.
 */
export function playableChoices(
  graph: RoadGraph,
  mode: TaxiMode,
  nodeId: NodeId,
  arrivedVia: EdgeId | null,
): GraphEdge[] {
  const all = outgoingEdges(graph, mode, nodeId, arrivedVia);
  if (!arrivedVia || all.length <= 1) return all;

  const via = graph.edges[arrivedVia];
  if (!via) return all;

  const heading = edgeBearing(graph, via);
  const forward = all.filter((edge) => {
    if (edge.to === via.from) return false;
    const rel = relativeTurnDeg(heading, edgeBearing(graph, edge));
    return Math.abs(rel) < UTURN_DEG;
  });

  return forward.length > 0 ? forward : all;
}

/** True if taking this edge leaves nowhere to go except back. */
function isDeadEndStub(
  graph: RoadGraph,
  mode: TaxiMode,
  edge: GraphEdge,
): boolean {
  const outs = outgoingEdges(graph, mode, edge.to, edge.id);
  return outs.every((e) => e.to === edge.from);
}

/**
 * Forward exits that are real corridors (not hospital/alley dead-end stubs).
 * Falls back to all playable exits if every option is a stub.
 */
export function decisionChoices(
  graph: RoadGraph,
  mode: TaxiMode,
  nodeId: NodeId,
  arrivedVia: EdgeId | null,
): GraphEdge[] {
  const choices = playableChoices(graph, mode, nodeId, arrivedVia);
  const meaningful = choices.filter((e) => !isDeadEndStub(graph, mode, e));
  return meaningful.length > 0 ? meaningful : choices;
}

/**
 * Sole exit the sim should take without asking.
 * Only when there is exactly one meaningful corridor — never skips a
 * real turnoff the player might need for the shortest path.
 */
export function autoContinueEdge(
  graph: RoadGraph,
  mode: TaxiMode,
  nodeId: NodeId,
  arrivedVia: EdgeId | null,
): GraphEdge | null {
  const choices = decisionChoices(graph, mode, nodeId, arrivedVia);
  return choices.length === 1 ? choices[0]! : null;
}

/**
 * After the player picks `first`, keep appending auto-continues until a
 * real fork or the destination. Collapses OSM shape-point / stub spam.
 */
export function extendForcedPath(
  graph: RoadGraph,
  mode: TaxiMode,
  first: GraphEdge,
  destinationNode: NodeId,
): GraphEdge[] {
  const path: GraphEdge[] = [first];
  let node = first.to;
  let via: EdgeId = first.id;
  let guard = 0;

  while (guard++ < 4000) {
    if (node === destinationNode) break;
    const next = autoContinueEdge(graph, mode, node, via);
    if (!next) break;
    path.push(next);
    node = next.to;
    via = next.id;
  }

  return path;
}

export function pathLengthM(edges: GraphEdge[]): number {
  return edges.reduce((sum, e) => sum + e.lengthM, 0);
}

/** Interpolate along a multi-edge path; t in [0, 1]. */
export function positionAlongPath(
  graph: RoadGraph,
  edges: GraphEdge[],
  t: number,
): {
  lng: number;
  lat: number;
  edge: GraphEdge | null;
  bearing: number;
} {
  if (edges.length === 0) {
    return { lng: 114.1694, lat: 22.3193, edge: null, bearing: 0 };
  }

  const total = pathLengthM(edges);
  if (total <= 0) {
    const e = edges[0]!;
    const a = graph.nodes[e.from];
    return {
      lng: a?.lng ?? 114.1694,
      lat: a?.lat ?? 22.3193,
      edge: e,
      bearing: edgeBearing(graph, e),
    };
  }

  let remain = Math.min(1, Math.max(0, t)) * total;
  for (const edge of edges) {
    const len = Math.max(edge.lengthM, 1e-6);
    if (remain > len && edge !== edges[edges.length - 1]) {
      remain -= len;
      continue;
    }
    const localT = Math.min(1, remain / len);
    const a = graph.nodes[edge.from];
    const b = graph.nodes[edge.to];
    if (!a || !b) {
      return { lng: 114.1694, lat: 22.3193, edge, bearing: 0 };
    }
    return {
      lng: a.lng + (b.lng - a.lng) * localT,
      lat: a.lat + (b.lat - a.lat) * localT,
      edge,
      bearing: edgeBearing(graph, edge),
    };
  }

  const last = edges[edges.length - 1]!;
  const b = graph.nodes[last.to];
  return {
    lng: b?.lng ?? 114.1694,
    lat: b?.lat ?? 22.3193,
    edge: last,
    bearing: edgeBearing(graph, last),
  };
}
